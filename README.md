# discord-iptv

A Discord bot to browse and stream IPTV playlists directly into a Discord voice channel. Built with Node.js and discord.js, this project allows you to control IPTV streaming via Discord commands, with support for M3U playlists and FFmpeg-based streaming.

## Features
- Browse IPTV channels and categories from M3U playlists
- Stream live TV directly into a Discord voice channel
- Simple command interface in Discord
- Pagination for large playlists
- Docker support for easy deployment

## Requirements
- Node.js 18+
- FFmpeg (automatically installed in Docker image)
- A Discord bot token and a Discord server
- An M3U playlist URL

## Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/yourusername/discord-iptv.git
cd discord-iptv
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment variables
Create a `.env` file in the root directory with the following variables:
```env
DISCORD_BOT_TOKEN=your-bot-token
DISCORD_COMMAND_CHANNEL_ID=your-command-channel-id
DISCORD_GUILD_ID=your-guild-id
DISCORD_ALLOWED_ROLE_ID=role-id-allowed-to-control-bot
SELFBOT_TOKEN=your-selfbot-token (if using selfbot mode)
SELFBOT_GUILD_ID=your-guild-id (if using selfbot mode)
SELFBOT_VOICE_CHANNEL_ID=voice-channel-id (if using selfbot mode)
M3U_URL=https://your-playlist-url.m3u
DISCORD_PREFIX=!tv 
```

### 4. Run the bot
```bash
npm start
```

Or with Docker:
```bash
docker build -t discord-iptv .
docker run --env-file .env discord-iptv
```

## Usage
- Use commands in your designated Discord channel to browse and play IPTV channels.
- Only users with the allowed role can control the bot.
- The bot will join the specified voice channel and stream the selected channel.

## Folder Structure
- `src/bot/` — Discord bot logic, commands, and event handlers
- `src/services/` — Playlist parsing and worker control
- `src/worker/` — FFmpeg streaming worker
- `src/app.js` — Main application logic

## License
ISC

---

*Made with ❤️ for the Discord and IPTV community.*
