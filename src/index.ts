import { homedir } from "node:os";
import path from "node:path";
import { handleDeviceCommand } from "./cli";
import { listDevices, syncDeviceData } from "./lib/device";

const args = process.argv.slice(2);

// Check for help flag
if (args.includes("-h") || args.includes("--help")) {
	console.log(`Usage: ccumd [OPTIONS] [COMMAND]

Commands:
  daily              Show daily usage (default)
  monthly            Show monthly usage
  totals             Show total usage
  device <command>   Manage devices

Options:
  -h, --help         Show this help message
  --graph            Display usage as interactive chart
  -o <file>          Save chart as HTML file (with --graph)

Device Commands:
  device                  List all devices
  device add <name>       Add a new device
  device delete <name>    Delete a device

Examples:
  ccumd                    # Show daily usage
  ccumd monthly            # Show monthly usage
  ccumd --graph            # Show daily usage as chart
  ccumd daily --graph      # Show daily usage as chart`);
	process.exit(0);
}

if (args[0] === "device") {
	await handleDeviceCommand(args.slice(1));
} else {
	const devices = listDevices();
	const paths = [`${homedir()}/.claude`];

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
		const ccusageArgs = args.filter((_, index) => 
			index !== graphIndex && 
			index !== outputIndex && 
			(outputIndex === -1 || index !== outputIndex + 1)
		);
		const subcommands = ccusageArgs.length > 0 ? ccusageArgs : ["daily"];

		// Get cost data with --json flag
		const { $ } = await import("bun");
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
			const { $ } = await import("bun");
			await $`open http://localhost:3004`;

			// Keep server running
			process.on("SIGINT", () => {
				server.stop();
				process.exit(0);
			});

			// Keep the process alive
			await new Promise(() => { });
		}
	} else {
		const subcommands = args.length > 0 ? args.slice(0) : "daily";
		const { $ } = await import("bun");
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
