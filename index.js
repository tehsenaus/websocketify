#!/usr/bin/env node

var childProcess = require('child_process');
var WebSocket = require('ws');

var program = require('commander')
	.command('websocketify <program> [args...]')
	.version(require('./package.json').version)
	.option('-p, --port <port>', 'Port to listen on')
	.option('--address <addr>', 'Address to bind on')
	.option('--singleton', 'Share a single instance of the process between all clients')
	.option('--devconsole', 'Expose dev console')
	.parse(process.argv);

if ( program.args.length === 0 && !program.devconsole ) {
	console.error('websocketify: <program> or --devconsole must be specified');
	process.exit(1);
}

var server = require('http').createServer(function (req, res) {
	if (!program.devconsole) {
		return res.socket.destroy();
	}

	require('fs').readFile(__dirname + '/console/index.html', 'utf8', function (e, html) {
		res.writeHead(200);
		res.write(html);
		res.end();
	});
});

if ( program.args.length > 0 ) {
	var sharedProc;
	var wss = new WebSocket.Server({ server: server });

	wss.on('connection', function (ws) {
		var proc;

		if ( !sharedProc || sharedProc.isDead() ) {
			console.log('websocketify: client connected: starting child process:',
				program.args.join(' '));

			proc = createChildProcess();

			if ( program.singleton ) {
				sharedProc = proc;
			}
		} else {
			console.log('websocketify: client connected: using existing child process');
			proc = sharedProc;
		}

		proc.addSocket(ws);

		ws.on('message', function (message) {
			proc.process.stdin.write(message + '\n');
		});
		ws.on('close', function () {
			if ( proc.removeSocket(ws) && sharedProc === proc ) {
				sharedProc = null;
			}
		});
	});
}

var port = parseInt(program.port || 8080),
	bindAddress = process.address || '0.0.0.0';
server.listen(port, bindAddress);
console.log('websocketify: listening on %s:%s', port, bindAddress);

function createChildProcess() {
	var proc = childProcess.spawn(program.args[0], program.args.slice(1), {
		env: process.env
	});

	var sockets = [];
	var dead = false;

	proc.stdout.on('data', function (data) {
		var lines = data.toString('utf8').split('\n');
		lines.slice(0, lines.length-1).forEach(function (line) {
			sockets.forEach(function (ws) {
				ws.send(line);
			});
		});
	});

	proc.stderr.on('data', function (data) {
		console.error('stderr:', data.toString('utf8'));
	});

	proc.on('exit', function (code) {
		console.log('websocketify: child process exited with code %d', code);
		dead = true;
		sockets.forEach(function (ws) {
			ws.close(code ? 1001 : 1000, '' + code);
		});
	});

	proc.on('error', function (e) {
		console.log('websocketify: child process error:', e);
		dead = true;
		sockets.forEach(function (ws) {
			ws.close(1011, ''+e);
		});
	});

	return {
		process: proc,

		isDead: function () {
			return dead;
		},

		addSocket: function (ws) {
			sockets.push(ws);
		},

		removeSocket: function (ws) {
			sockets = sockets.filter(function (s) {
				return s !== ws;
			});

			console.log('websocketify: socket disconnected, %d remain', sockets.length);

			if ( sockets.length ) return false;

			if ( !dead ) {
				console.log('websocketify: stopping child process');
				proc.kill();
			}

			return true;
		}
	}
}
