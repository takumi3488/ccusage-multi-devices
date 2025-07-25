# ccusage-multi-devices

ccusage-multi-devices is a Bun CLI inspired byhttps://github.com/ryoppippi/ccusage, which retrieves Claude Code usage fees and can display them as graphs.

## Usage

```
bunx ccumd                                                   # Display daily usage
bunx ccumd --graph --since 20250525 --until 20250530         # Display a graph of usage
bunx ccumd device                                            # Display the list of registered devices
bunx ccumd device add <device>                               # Add a device (<device> is usually the Host value in `$HOME/.ssh/config`)
bunx ccumd device delete <device>                            # Delete a device
```
