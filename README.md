# Occam's Quest

A 15-minute pixel-art journey through the history of simplicity, from William of Occam to Thomas Bayes. Based on J. McFadden (2021), *Life Is Simple*.

**[Play it in your browser](https://edogiuili.github.io/SharinIsCaring/)**

Before each scientist's lesson, the audience answers a short question on their phones: they scan the QR code on screen, tap an answer, and the results appear in the game.

| Key | Does |
| --- | --- |
| ←↑↓→ / WASD | Walk |
| Space / Enter | Talk, continue, close voting |
| 1–7 | Jump to a stop |
| C | Codex |
| I | More detail on a lesson card |
| R | Restart |
| M | Music on/off |

## Files

- `index.html`: the game.
- `vote.html`: the page the audience opens on their phones.
- `live-config.js`: the address of the live server.
- `worker/`: the live server, a small [Cloudflare Worker](https://developers.cloudflare.com/workers/) that passes questions and votes between the game and the phones.

Without the live server, the game still works and the questions become a show of hands.

## Live voting setup

Deploy the Worker (needs Node.js and a free Cloudflare account):

```sh
cd worker
npx wrangler@4 login
npx wrangler@4 deploy                     # prints https://occams-quest.<subdomain>.workers.dev
openssl rand -hex 16                      # your presenter key: keep it private
npx wrangler@4 secret put PRESENTER_KEY   # paste the key
```

Put the printed address in `server` in `live-config.js` and push.

On the presenting laptop, open the game once as `https://edogiuili.github.io/SharinIsCaring/?key=<presenter key>`, before the projector is on. The game remembers the key and removes it from the address bar. Only a browser with the key can open and close questions.

Don't redeploy the Worker during the talk: it briefly disconnects every phone.

## Editing the questions

The questions are in `QUESTIONS` in `index.html`, one per lesson, with up to 4 options. `correct` is the index of the right option, or `null` for an opinion question. Changing them doesn't need a new Worker deploy.

## Testing the Worker locally

```sh
cd worker
echo 'PRESENTER_KEY=dev' > .dev.vars
npx wrangler@4 dev
```

Set `server` in `live-config.js` to `http://localhost:8787`, then open `index.html?key=dev` and `vote.html` in your browser.
