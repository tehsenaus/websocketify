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
	var numClients = 0, sharedProc;
	var wss = new WebSocket.Server({ server: server });

	wss.on('connection', function (ws) {
		var proc;

		numClients++;

		if ( !program.singleton || numClients === 1 ) {
			console.log('websocketify: starting child process:', program.args.join(' '));

			proc = childProcess.spawn(program.args[0], program.args.slice(1), {
				env: process.env
			});

			if ( program.singleton ) {
				sharedProc = proc;
			}
		} else {
			proc = sharedProc;
		}

		var onData = function (data) {
			var lines = data.toString('utf8').split('\n');
			lines.slice(0, lines.length-1).forEach(function (line) {
				ws.send(line);
			});
		}
		proc.stdout.on('data', onData);

		var onError = function (data) {
			console.error('stderr:', data.toString('utf8'));
		}
		proc.stderr.on('data', onError);

		var onExit = function (code) {
			ws.close(code ? 1001 : 1000, '' + code);
		}
		proc.on('exit', onExit);

		var onError = function (e) {
			ws.close(1011, ''+e);
		}
		proc.on('error', onError);

		ws.on('message', function (message) {
			proc.stdin.write(message + '\n');
		});
		ws.on('close', function () {
			numClients--;

			if ( !program.singleton || numClients === 0 ) {
				console.log('websocketify: stopping child process');
				proc.kill();
				sharedProc = null;
			} else {
				proc.stdout.removeListener('data', onData);
				proc.stderr.removeListener('data', onError);
				proc.removeListener('exit', onExit);
				proc.removeListener('error', onError);
			}
		});

	});
}

server.listen(parseInt(program.port || 8080), process.address || '0.0.0.0');
