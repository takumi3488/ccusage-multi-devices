#!/usr/bin/env bun

import { homedir } from "node:os";
import path from "node:path";
import { $ } from "bun";
import { handleDeviceCommand, handleS3Command } from "./cli";
import { getS3Buckets, listDevices, syncDeviceData } from "./lib/device";
import { syncS3Data } from "./lib/s3";

const args = process.argv.slice(2);

// Check for help flag
if (args.includes("-h") || args.includes("--help")) {
	console.log(`Usage: ccumd [OPTIONS] [COMMAND]

Commands:
  daily              Show daily usage (default)
  monthly            Show monthly usage
  totals             Show total usage
  device <command>   Manage devices
  s3 <command>       Manage S3 integration

Options:
  -h, --help         Show this help message
  --graph            Display usage as interactive chart
  -o <file>          Save chart as HTML file (with --graph)

Device Commands:
  device                  List all devices
  device add <name>       Add a new device
  device delete <name>    Delete a device

S3 Commands:
  s3                      List configured S3 buckets
  s3 add <name> ...       Add an S3 bucket configuration
  s3 delete <name>        Delete an S3 bucket configuration

Examples:
  ccumd                    # Show daily usage
  ccumd monthly            # Show monthly usage
  ccumd --graph            # Show daily usage as chart
  ccumd daily --graph      # Show daily usage as chart
  ccumd s3 add my-s3 https://s3.amazonaws.com my-bucket key secret`);
	process.exit(0);
}

if (args[0] === "device") {
	await handleDeviceCommand(args.slice(1));
} else if (args[0] === "s3") {
	await handleS3Command(args.slice(1));
} else {
	const devices = listDevices();
	const s3Buckets = getS3Buckets();
	const paths = [`${homedir()}/.claude`];

	// Sync device data
	if (devices.length > 0) {
		console.log("Syncing device data...");
		for (const device of devices) {
			try {
				await syncDeviceData(device);
				const devicePath = path.join(homedir(), ".ccumd", "devices", device);
				paths.push(devicePath);
				console.log(`✓ Synced ${device}`);
			} catch (error) {
				console.error(`✗ Failed to sync ${device}: ${error}`);
			}
		}
		console.log();
	}

	// Sync S3 data if configured
	if (s3Buckets.length > 0) {
		console.log("Syncing S3 data...");
		for (const s3Config of s3Buckets) {
			try {
				await syncS3Data(s3Config);
				const s3Path = path.join(homedir(), ".ccumd", "s3", s3Config.name);
				paths.push(s3Path);
				console.log(`✓ Synced S3: ${s3Config.name}`);
			} catch (error) {
				console.error(`✗ Failed to sync S3 ${s3Config.name}: ${error}`);
			}
		}
		console.log();
	}

	const claudePath = paths.join(",");

	// Check if --graph flag is present
	const graphIndex = args.indexOf("--graph");
	if (graphIndex !== -1) {
		// Check if -o option is present
		const outputIndex = args.indexOf("-o");
		let outputFile = null;
		if (outputIndex !== -1 && outputIndex + 1 < args.length) {
			outputFile = args[outputIndex + 1];
		}

		// Remove --graph and -o options from args for ccusage command
		const ccusageArgs = args.filter(
			(_, index) =>
				index !== graphIndex &&
				index !== outputIndex &&
				(outputIndex === -1 || index !== outputIndex + 1),
		);
		const subcommands = ccusageArgs.length > 0 ? ccusageArgs : ["daily"];

		// Get cost data with --json flag
		const result = await $`bunx ccusage ${subcommands} --json`
			.env({
				CLAUDE_CONFIG_DIR: claudePath,
				FORCE_COLOR: "1",
			})
			.text();

		const costData = JSON.parse(result);

		// If output file is specified, write HTML to file
		if (outputFile) {
			const htmlContent = getChartHTML(costData);
			await Bun.write(outputFile, htmlContent);
			console.log(`Chart HTML written to ${outputFile}`);
		} else {
			// Start web server with chart
			const server = Bun.serve({
				port: 3004,
				fetch(req) {
					const url = new URL(req.url);

					if (url.pathname === "/") {
						return new Response(getChartHTML(costData), {
							headers: { "Content-Type": "text/html" },
						});
					}

					if (url.pathname === "/data") {
						return new Response(JSON.stringify(costData), {
							headers: { "Content-Type": "application/json" },
						});
					}

					return new Response("Not Found", { status: 404 });
				},
			});

			console.log(`Chart server running at http://localhost:3004`);

			// Open browser
			await $`open http://localhost:3004`;

			// Keep server running
			process.on("SIGINT", () => {
				server.stop();
				process.exit(0);
			});

			// Keep the process alive
			await new Promise(() => {});
		}
	} else {
		const subcommands = args.length > 0 ? args.slice(0) : "daily";
		await $`bunx ccusage ${subcommands}`.env({
			CLAUDE_CONFIG_DIR: claudePath,
			FORCE_COLOR: "1",
		});
	}
}

function getChartHTML(costData: object): string {
	return `<!DOCTYPE html>
<html>
<head>
    <title>Claude Cost Usage Chart</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .container { max-width: 1200px; margin: 0 auto; }
        .chart-container { position: relative; height: 400px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Claude Cost Usage</h1>
        <div class="chart-container">
            <canvas id="costChart"></canvas>
        </div>
    </div>
    
    <script>
        const costData = ${JSON.stringify(costData)};
        
        // Extract dates and totals for the chart
        const labels = [];
        const totals = [];
        
        if (costData.daily && Array.isArray(costData.daily)) {
            // Daily data array
            for (const dayData of costData.daily) {
                labels.push(dayData.date.substring(5));
                totals.push(dayData.totalCost || 0);
            }
        } else if (costData.usage_by_date) {
            // Daily/monthly data object
            for (const [date, data] of Object.entries(costData.usage_by_date)) {
                labels.push(date.substring(5));
                totals.push(data.total_cost || 0);
            }
        } else if (costData.totals && costData.totals.totalCost !== undefined) {
            // Single total from totals object
            labels.push('Total');
            totals.push(costData.totals.totalCost);
        }
        
        const ctx = document.getElementById('costChart').getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Cost ($)',
                    data: totals,
                    backgroundColor: 'rgba(67, 166, 233, 0.6)',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toFixed(1);
                            }
                        }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Claude Usage Cost Over Time'
                    }
                }
            }
        });
    </script>
</body>
</html>`;
}
