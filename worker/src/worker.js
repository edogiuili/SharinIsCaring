// Occam's Quest live server: relays audience answers between the phones (vote.html) and the game (index.html).
//
// One Durable Object ("Room") holds the state. Everyone connects to /ws over a WebSocket:
//   game:  /ws?role=stage&key=PRESENTER_KEY   opens and closes questions, receives live counts
//   phone: /ws?v=<random phone id>            receives the current question, sends votes
//
// Messages (JSON):
//   stage → server  {t:'open', n, qid, q, options}   n = round id chosen by the game; resending the same n is harmless
//                   {t:'close', n, answer}           answer = index of the right option, or null
//   phone → server  {t:'vote', n, i}
//   server → stage  {t:'counts', n, counts, total, phones}
//   server → phone  {t:'state', cur, mine}          cur = {n, qid, q, options, open, answer} or null

import { DurableObject } from "cloudflare:workers";

const MAX_OPTIONS = 4;
const MAX_TEXT = 300;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      if (req.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
      return env.ROOM.get(env.ROOM.idFromName("main")).fetch(req);
    }
    if (url.pathname === "/") return new Response("Occam's Quest live server is running.\n");
    return new Response("Not found\n", { status: 404 });
  },
};

const str = (s) => (typeof s === "string" ? s.slice(0, MAX_TEXT) : "");

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.env = env;
    this.cur = null;
    this.votes = {};
    ctx.blockConcurrencyWhile(async () => {
      this.cur = (await ctx.storage.get("cur")) || null;
      this.votes = (await ctx.storage.get("votes")) || {};
    });
  }

  async fetch(req) {
    const url = new URL(req.url);
    const role = url.searchParams.get("role") === "stage" ? "stage" : "phone";
    const v = url.searchParams.get("v") || "";
    const [client, server] = Object.values(new WebSocketPair());

    const badKey = role === "stage" && (!this.env.PRESENTER_KEY || url.searchParams.get("key") !== this.env.PRESENTER_KEY);
    const badPhone = role === "phone" && !/^[a-z0-9]{6,40}$/.test(v);
    if (badKey || badPhone) {
      server.accept();
      server.close(4001, badKey ? "wrong presenter key" : "bad phone id");
      return new Response(null, { status: 101, webSocket: client });
    }

    this.ctx.acceptWebSocket(server, [role]);
    server.serializeAttachment({ role, v });
    if (role === "stage") server.send(JSON.stringify(this.countsMsg()));
    else server.send(JSON.stringify(this.stateMsg(v)));
    this.sendCounts();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, data) {
    let m;
    try { m = JSON.parse(data); } catch { return; }
    const a = ws.deserializeAttachment() || {};

    if (a.role === "stage") {
      if (m.t === "open" && Number.isFinite(m.n) && Array.isArray(m.options)) {
        if (!this.cur || this.cur.n !== m.n) {
          const options = m.options.slice(0, MAX_OPTIONS).map(str);
          this.cur = { n: m.n, qid: str(m.qid), q: str(m.q), options, open: true, answer: null };
          this.votes = {};
          await this.ctx.storage.put({ cur: this.cur, votes: this.votes });
          this.broadcastState();
        }
        this.sendCounts();
      } else if (m.t === "close" && this.cur && this.cur.n === m.n && this.cur.open) {
        const ok = Number.isInteger(m.answer) && m.answer >= 0 && m.answer < this.cur.options.length;
        this.cur = { ...this.cur, open: false, answer: ok ? m.answer : null };
        await this.ctx.storage.put("cur", this.cur);
        this.broadcastState();
        this.sendCounts();
      }
      return;
    }

    if (m.t === "vote") {
      const c = this.cur;
      if (c && c.open && m.n === c.n && Number.isInteger(m.i) && m.i >= 0 && m.i < c.options.length) {
        this.votes[a.v] = m.i;
        await this.ctx.storage.put("votes", this.votes);
        this.sendCounts();
      }
      ws.send(JSON.stringify(this.stateMsg(a.v)));
    }
  }

  async webSocketClose(ws, code) {
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code); } catch {}
    this.sendCounts(ws);
  }

  async webSocketError(ws) {
    this.sendCounts(ws);
  }

  stateMsg(v) {
    return { t: "state", cur: this.cur, mine: this.cur && v in this.votes ? this.votes[v] : null };
  }

  countsMsg(exclude) {
    const c = this.cur;
    const counts = c ? c.options.map(() => 0) : [];
    let total = 0;
    if (c) for (const i of Object.values(this.votes)) if (i >= 0 && i < counts.length) { counts[i]++; total++; }
    const phones = this.ctx.getWebSockets("phone").filter((w) => w !== exclude).length;
    return { t: "counts", n: c ? c.n : null, counts, total, phones };
  }

  sendCounts(exclude) {
    const msg = JSON.stringify(this.countsMsg(exclude));
    for (const w of this.ctx.getWebSockets("stage")) if (w !== exclude) try { w.send(msg); } catch {}
  }

  broadcastState() {
    for (const w of this.ctx.getWebSockets("phone")) {
      const a = w.deserializeAttachment() || {};
      try { w.send(JSON.stringify(this.stateMsg(a.v))); } catch {}
    }
  }
}
