# websocketify
Node.js port of [websocketd](https://github.com/joewalnes/websocketd), turns any app using STDIN/STDOUT into a WebSocket server.

## Install
```
npm install -g websocketify
```

## Usage
```
websocketify --port 8080 --address 127.0.0.1 -- tail -f /var/log/system.log
```

## Features
### Dev Console
websocketify includes the dev console from websocketd, which is very useful for debugging web socket servers.
Enable it with ```--devconsole```, then open in your browser at your ```--address``` and ```--port```.

### Singleton Mode
By default websocketify will spawn a new child process for each WebSocket connection. With ```--singleton```, one child process
will be shared between all connections.

- The child process will start on the first connection, and stop once the last connection is closed.
- Output from the process is sent to all connected sockets.
- Input from any connection is sent to the process's STDIN.
- Output is not buffered.

