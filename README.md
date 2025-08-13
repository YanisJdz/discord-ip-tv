# Discord IpTv

A Discord bot to browse and stream IPTV playlists directly into a Discord voice channel. Built with Node.js and discord.js, this project allows you to control IPTV streaming via Discord commands, with support for M3U playlists and FFmpeg-based streaming.

## Acknowledgements

This project builds upon the excellent work in the [Discord-RE/Discord-video-stream](https://github.com/Discord-RE/Discord-video-stream) repository—a selfbot video streaming implementation that enables sending media via Discord’s custom UDP protocol.  
Special thanks to the author(s) for their effort in pushing the boundaries of what’s possible with Discord selfbots—note that this is experimental and not officially supported.

## Disclaimer

Selfbotting is against Discord's Terms of Service.  
Using this software may result in account termination, suspension, or other penalties from Discord.  
This project is provided for educational purposes only. The author does not encourage, endorse, or take responsibility for any misuse of this code.  
By using this software, you acknowledge that you do so at your own risk.

## Features

- Browse IPTV channels and categories from M3U playlists
- Stream live TV directly into a Discord voice channel
- Simple command interface in Discord
- Pagination for large playlists
- Docker support for easy deployment

## Requirements

- Node.js 18+
- FFmpeg (automatically installed in Docker image). If you dont want to use Docker, please use this FFmpeg Build from [BtbN](https://github.com/BtbN/FFmpeg-Builds)
- A Discord bot token and a Discord server
- An M3U playlist URL

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/discord-iptv.git
cd discord-iptv
```

### 2. Configure environment variables

Create a `.env` (copy `.env.example`) file in the root directory with the following variables:

```c
DISCORD_BOT_TOKEN=your-bot-token // Bot Token
DISCORD_COMMAND_CHANNEL_ID=your-command-channel-id // Text Channel ID for commands
DISCORD_GUILD_ID=your-guild-id // Server ID
DISCORD_ALLOWED_ROLE_ID=role-id-allowed-to-control-bot // Role ID (not working yet)
SELFBOT_TOKEN=your-selfbot-token // User Token ID
SELFBOT_GUILD_ID=your-guild-id //Server ID
SELFBOT_VOICE_CHANNEL_ID=voice-channel-id // Voice Chqnnel ID for Streaming
M3U_URL=https://your-playlist-url.m3u?user=xxx?password=xxx/
DISCORD_PREFIX=!tv // Whatever you want
```

#### How to find SELFBOT_TOKEN

⚠️ **Warning**: Accessing your Discord user token is against Discord's Terms of Service.  
Using it for selfbotting can lead to the permanent suspension of your account.  
Proceed only if you fully understand the risks and for educational purposes.

1. Open Discord in your web browser and log in to your account.
2. Press **F12** / **Ctrl+Shift+I** (or right-click → _Inspect_) to open Developer Tools.
3. Go to the **Network** tab.
4. In the filter/search bar, type `science`  and press Enter.
5. Click on one of the requests in the list.
6. Go to the **Headers** (or **Request Headers**) section.
7. Locate the `authorization` field — the long string there is your token.
8. Copy it and paste it into the `SELFBOT_TOKEN` variable in your configuration.

**Never share your token with anyone**.  
Anyone with this token can take full control of your account.

### 3. Run the bot

With Docker:

```
docker build -t discord-iptv .
docker run --rm -it discord-iptv
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

_Made with ❤️ for the Discord community._
