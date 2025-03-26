#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import meow from 'meow';
import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import { App } from './app_sm.js';
import portfinder from 'portfinder';
import childProcess from 'node:child_process';
import axios from 'axios';

type Config = {
	modelName: string;
	apiBase?: string;
	promptType?: string;
	apiKey?: string;
};

const cli = meow(
	`
    Usage
      $ theseus [command] [options]
  
    Commands
      start       Start the theseus server (default)
      configure   Configure the theseus CLI
  
    Options
      --version     Show version
      --port, -p    Set the port number (default: 10000)
      --api_key     Set the API key
      --model       Set the model name
      --api_base    Set the API base url
      --prompt_type Set the prompt type
      --debug       Turn on debug mode
  
    Examples
      $ theseus start --api_key=YOUR_API_KEY 
      $ theseus start --port 8080 --api_key=YOUR_API_KEY
      $ theseus start --model=gpt4-o --api_key=YOUR_API_KEY
      $ theseus start --model=claude-3-5-sonnet --api_key=YOUR_API_KEY
      $ theseus configure
  `,
	{
		importMeta: import.meta,
		flags: {
			version: {
				type: 'boolean',
				alias: 'v',
			},
			port: {
				type: 'number',
				alias: 'p',
				default: 10000,
			},
			api_key: {
				type: 'string',
			},
			debug: {
				type: 'boolean',
			},
		},
	},
);

if (cli.flags.version) {
	console.log(cli.pkg.version);
	process.exit(0);
}

const controller = new AbortController();

const { input } = cli;

if (input[0] === 'configure') {
	// Handle the configure subcommand
	console.log('Configuring theseus CLI...');

	inquirer
		.prompt([
			{
				type: 'list',
				name: 'modelName',
				message: 'Select the model name:',
				choices: [
					'claude-3-5-sonnet',
					'gpt4-o',
					// 'llama-3-70b',
					// 'ollama/deepseek-coder:6.7b',
					// 'custom',
				],
			},
		])
		.then(answers => {
			if (answers.modelName === 'custom') {
				return inquirer.prompt([
					{
						type: 'input',
						name: 'modelName',
						message: 'Enter the model name:',
					},
					{
						type: 'input',
						name: 'apiBase',
						message: 'Enter the API base url:',
					},
					{
						type: 'input',
						name: 'apiKey',
						message: 'Enter the API key:',
					},
					{
						type: 'list',
						name: 'promptType',
						message: 'Enter the prompt type:',
						choices: ['openai', 'anthropic', 'llama3'],
					},
				]);
			}
			return Promise.resolve(answers);
		})
		.then(answers => {
			const modelName = answers.modelName;
			console.log(`Selected model name: ${modelName}`);

			// Save the selected model name to .theseus.config file in the package directory
			const packageDir = process.cwd();
			const configPath = path.join(packageDir, '.theseus.config');
			const config: Config = {
				modelName: modelName,
			};

			if (answers.apiBase) {
				config.apiKey = answers.apiKey;
				config.apiBase = answers.apiBase;
				config.promptType = answers.promptType;
			}

			fs.writeFile(configPath, JSON.stringify(config, null, 2), err => {
				if (err) {
					console.error('Error saving configuration:', err);
				} else {
					console.log('Configuration saved to', configPath);
				}
				process.exit(0);
			});
		});
} else if (input[0] === 'index') {

	portfinder.setBasePort(cli.flags.port);
	portfinder.getPort(async function (_: any, port: number) {
		if (!childProcess.spawnSync('theseus_agent', ['--help']).stdout) {
			console.error(
				'The "theseus" command is not available. Please ensure it is installed and in your PATH.',
			);
			process.exit(1);
		}
		console.log([
			'server',
			'--port',
			port.toString(),
		]);

		const subProcess = childProcess.spawn(
			'theseus_agent',
			[
				'server',
				'--port',
				port.toString(),
			],
			{
				signal: controller.signal,
			},
		);

		subProcess.stdout.on('data', (data) => {
			console.log(data.toString('utf8'));
		});

		subProcess.stderr.on('data', (data) => {
			console.error(data.toString('utf8'));
		});



		let retries = 0;
		const maxRetries = 5;
		const retryInterval = 10000; // 1 second

		const indexDirectory = async () => {

			while (retries < maxRetries) {
				try {
					
				await axios.delete(`http://localhost:${port}/indexes/${encodeURIComponent(process.cwd().replace(/\//g, '%2F'))}`);
				await axios.post(`http://localhost:${port}/indexes/${encodeURIComponent(process.cwd().replace(/\//g, '%2F'))}`);
				break;


				} catch (error) {
					retries++;
					// console.log(error)
					console.log(`Retrying indexing (attempt ${retries}/${maxRetries})...`);
					await new Promise(resolve => setTimeout(resolve, retryInterval));
					// indexDirectory();
					} 
				}
		}

		await indexDirectory();

		let status = "pending";
		while (status !== "done") {
			try {
				const response = await axios.get(`http://localhost:${port}/indexes/${encodeURIComponent(process.cwd().replace(/\//g, '%2F'))}/status`);
				status = response.data;
			await new Promise(resolve => setTimeout(resolve, 5000));
			} catch (error) {
				console.error('Failed to get index status.');
				subProcess.kill('SIGKILL');
				process.exit(1);
			}

		}
		subProcess.kill('SIGKILL');
	});
}

else {

	let api_key: string | undefined = undefined;
	let modelName: string | undefined = undefined;
	let api_base: string | undefined = undefined;
	let prompt_type: string = "anthropic";

	if (cli.flags.apiKey) {
		api_key = cli.flags['apiKey'];
	} 
	// else if (process.env['OPENAI_API_KEY']) {
	// 	api_key = process.env['OPENAI_API_KEY'];
	// 	modelName = 'gpt4-o';
		// prompt_type = "openai";
	// }
	 else if (process.env['ANTHROPIC_API_KEY']) {
		api_key = process.env['ANTHROPIC_API_KEY'];
		modelName = 'claude-3-5-sonnet';
	} else if (process.env['GROQ_API_KEY']) {
		api_key = process.env['GROQ_API_KEY'];
		modelName = 'llama-3-70b';
		// prompt_type = "llama3";
	} else {
		console.log(
			'Please provide an API key using the --api_key option or by setting OPENAI_API_KEY or ANTHROPIC_API_KEY.',
		);
		process.exit(1);
	}

	const packageDir = process.cwd();
	const configPath = path.join(packageDir, '.theseus.config');

	try {
		if (fs.existsSync(configPath)) {
			const configData = fs.readFileSync(configPath, 'utf8');
			const config: Config = JSON.parse(configData);
			modelName = config.modelName ? config.modelName : modelName;
			api_key = config.apiKey ? config.apiKey : api_key;

			if (config.apiBase) {
				api_base = config.apiBase;
				console.log('Using api base:', api_base);
			}
			if (config.promptType) {
				prompt_type = config.promptType;
				console.log('Using prompt type:', prompt_type);
			}
		}
		console.log('Using model name:', modelName);
	} catch (err) {
		console.error('Error reading configuration:', err);
		process.exit(1);
	}

	portfinder.setBasePort(cli.flags.port);
	portfinder.getPort(function (_: any, port: number) {
		if (!childProcess.spawnSync('theseus_agent', ['--help']).stdout) {
			console.error(
				'The "theseus" command is not available. Please ensure it is installed and in your PATH.',
			);
			process.exit(1);
		}
		console.log([
			'server',
			'--port',
			port.toString(),
		]);

		let reset = false;

		inquirer
			.prompt([
				{
					type: 'list',
					name: 'continue',
					message: 'Continue previous session?',
					choices: ['yes', 'no'],
				},
			])
			.then(answers => {
				reset = answers.continue === 'no';

				const subProcess = childProcess.spawn(
					'theseus_agent',
					[
						'server',
						'--port',
						port.toString(),
					],
					{
						signal: controller.signal,
					},
				);

				if (cli.flags.debug) {
					subProcess.stdout.on('data', (newOutput: Buffer) => {
						console.log(newOutput.toString('utf8'));
					});

					subProcess.stderr.on('data', (newOutput: Buffer) => {
						console.error(newOutput.toString('utf8'));
					});
				}



				const { waitUntilExit } = render(<App port={port} reset={reset} agentConfig={{
					api_key: api_key as string,
					model: modelName as string,
					prompt_type: prompt_type as string,
					api_base: api_base as string,
				}} />, {
					exitOnCtrlC: true,
				});

				waitUntilExit().then(() => {
					console.log('Exiting...');
					subProcess.kill('SIGKILL');
					process.exit(0);
				});
			});
	});
}
