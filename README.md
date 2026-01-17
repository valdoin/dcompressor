# dcompressor

A simple local web tool to trim, compress, and upload video clips directly to a specific Discord channel, bypassing the file size limit.

## Prerequisites

- Node.js installed.
- A Discord Bot Token and a Channel ID where clips will be sent.

## Installation

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a .env file in the root directory:
    ```bash
    DISCORD_TOKEN=your_bot_token  
    CLIPS_CHANNEL_ID=your_target_channel_id
    ```
## Usage

1. Compile the project : ```npx tsc```

2. Start the server : ```node dist/index.js```

3. Go to : ```http://localhost:8080```