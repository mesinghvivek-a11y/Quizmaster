/* A member keeps one identity in a room. Each new tab gets a fresh connection. */
window.LiveRoomLink = class LiveRoomLink {
  constructor(code, key, host) {
    this.code = code;
    this.key = key;
    this.host = host;
    this.session = crypto.randomUUID();
    this.cursor = 0;
    this.revision = 0;
    this.closed = false;
    this.outbox = Promise.resolve();
    this.connections = new Map();
  }

  async rpc(action, data = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const request = {
        p_action: action, p_code: this.code, p_key: this.key,
        p_session: this.session, p_data: data
      };
      const reply = await QM.client().rpc('qm_room', request).abortSignal(controller.signal);
      if (reply.error) {
        if (reply.error.code === 'PGRST202') {
          throw Object.assign(new Error('Live room setup is missing. Run supabase/live-rooms.sql.'), {reason: 'setup'});
        }
        if (reply.status === 401 || reply.status === 403) {
          throw Object.assign(new Error('Room access could not be verified. Reopen the test page.'), {reason: 'access'});
        }
        if (reply.status >= 400 && reply.status < 500 && ![408, 429].includes(reply.status)) {
          throw Object.assign(new Error('The server declined this room request.'), {reason: 'invalid'});
        }
        throw new Error('Connection interrupted. Please try again.');
      }
      const result = reply.data;
      if (result.error) {
        const messages = {
          signin: 'Sign in to enter a test.',
          unavailable: 'Room unavailable. Check the code or contact the host.',
          kicked: 'The host removed you. Use Join room to return.',
          superseded: 'This room is open in another tab or device.'
        };
        throw Object.assign(new Error(messages[result.error] || 'Room request declined.'), {reason: result.error});
      }
      return result;
    } finally {
      clearTimeout(timer);
    }
  }

  async open(action, manual, snapshot) {
    let result;
    try {
      result = await this.rpc(action, {manual,snapshot});
    } catch (error) {
      // A dropped response can follow a committed join. Retry with the same session.
      if (error.reason || this.closed) throw error;
      result = await this.rpc(action, {manual,snapshot});
    }
    this.cursor = result.cursor;
    this.hostSession = result.hostSession;
    this.memberId = result.member;
  }

  async moderate(action, member) {
    const data = {member, request: crypto.randomUUID()};
    try {
      await this.rpc(action, data);
    } catch (error) {
      if (error.reason || this.closed) throw error;
      await this.rpc(action, data);
    }
    // A poll sent before moderation can still be in flight.
    this.revision++;
  }

  send(msg, to = 'host') {
    const data = {msg, to, request: crypto.randomUUID()};
    const deliver = async () => {
      let delay = 350;
      while (!this.closed) {
        try {
          await this.rpc('send', data);
          return;
        } catch (error) {
          if (this.closed) return;
          if (error.reason) return this.fail(error);
          this.onNetwork?.();
          await new Promise(resolve => setTimeout(resolve, delay));
          delay = Math.min(3000, delay * 2);
        }
      }
    };
    this.outbox = this.outbox.then(deliver);
    return this.outbox;
  }

  bc(msg) { return this.send(msg, '*'); }

  fail(error) {
    if (this.closed) return;
    this.destroy();
    this.onFailure?.(error);
  }

  async poll() {
    const revision = this.revision;
    const result = await this.rpc('poll', {after: this.cursor});
    if (this.closed || revision !== this.revision) return 0;
    if (!this.host && this.hostSession !== result.hostSession) {
      this.hostSession = result.hostSession;
      this.onRestore?.();
    }
    for (const event of result.events) {
      if (this.closed || revision !== this.revision) return 0;
      let connection = null;
      if (this.host) {
        connection = this.connections.get(event.from);
        if (!connection) {
          connection = {
            member: event.member, session: event.from,
            send: msg => this.send(msg, event.from)
          };
          this.connections.set(event.from, connection);
        }
      }
      await this.onMessage(connection, event.msg);
      this.cursor = event.seq;
    }
    if (this.host && !this.closed && revision === this.revision) {
      this.onMembers?.(result.members);
      const active = new Set(result.members.filter(m => m.status === 'active').map(m => m.session));
      for (const session of this.connections.keys()) {
        if (!active.has(session)) this.connections.delete(session);
      }
      if (result.events.length) this.onCheckpoint?.();
    }
    this.onConnected?.();
    return result.events.length === 100 ? 0 : 850;
  }

  start() {
    const tick = async () => {
      if (this.closed) return;
      let delay;
      try {
        delay = await this.poll();
      } catch (error) {
        if (this.closed) return;
        if (error.reason) return this.fail(error);
        this.onNetwork?.();
        delay = 1800;
      }
      if (!this.closed) this.timer = setTimeout(tick, delay);
    };
    tick();
  }

  destroy() {
    this.closed = true;
    clearTimeout(this.timer);
  }
};
