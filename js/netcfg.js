// Multiplayer relay (TURN) settings. Fill these in once and every player gets the relay.
//
// Why: direct peer-to-peer only works when both networks allow it. Phones on mobile data, school / hotel / office wifi
// and some home routers block it. A TURN relay passes the game traffic through a server instead, so those players can connect.
//
// Free relay (no card needed): Metered's Open Relay gives 20 GB a month free, which is a LOT of driving: a game's
// position updates are tiny. Steps:
//   1. Sign up free at https://www.metered.ca/tools/openrelay/
//   2. In the dashboard note your app name (the part before .metered.live) and copy the TURN credential's API key
//   3. Paste them below, upload this file to js/ and hard-refresh
// The key is made for use in web pages (it can only fetch relay logins, nothing else), so it's fine for it to be public.
// Players can also paste their own in the game: Multiplayer screen › Relay settings.
export const METERED_APP = '';   // e.g. 'overpass'  (from overpass.metered.live)
export const METERED_KEY = '';   // the TURN credential's API key

// Any other TURN servers you have (same format as RTCPeerConnection iceServers), e.g.
// { urls: ['turn:turn.example.com:3478', 'turns:turn.example.com:5349'], username: 'user', credential: 'pass' }
export const EXTRA_ICE = [];
