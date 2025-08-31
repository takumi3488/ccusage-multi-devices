# ccusage-multi-devices

ccusage-multi-devices is a Bun CLI inspired by https://github.com/ryoppippi/ccusage, which retrieves Claude Code usage fees and can display them as graphs. It supports syncing usage data from multiple devices via SSH and S3-compatible storage.

## Usage

### Basic Commands

```bash
bunx ccumd                                                   # Display daily usage
bunx ccumd monthly                                           # Display monthly usage
bunx ccumd totals                                           # Display total usage
bunx ccumd --graph                                          # Display usage as interactive chart
bunx ccumd daily --graph -o chart.html                      # Save chart as HTML file
```

### Device Management (SSH)

```bash
bunx ccumd device                                           # List registered devices
bunx ccumd device add <device>                              # Add a device (Host from ~/.ssh/config)
bunx ccumd device delete <device>                           # Delete a device
```

### S3 Integration

```bash
bunx ccumd s3                                               # List configured S3 buckets
bunx ccumd s3 add <name> <endpoint> <bucket> <access_key> <secret_key>
                                                            # Add S3 bucket configuration
bunx ccumd s3 delete <name>                                 # Delete S3 bucket configuration

# Examples:
# AWS S3
bunx ccumd s3 add aws https://s3.amazonaws.com my-bucket AKIAIOSFODNN7EXAMPLE wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

# Cloudflare R2
bunx ccumd s3 add r2 https://accountid.r2.cloudflarestorage.com my-bucket key secret
```

## S3 Object Structure

This tool can sync Claude project archives created by GitHub Actions (like [takumi3488/mygha/cca](https://github.com/takumi3488/mygha/blob/main/cca/action.yml)).

Expected S3 object structure:
- **Prefix**: `claude_projects`
- **Format**: `claude_projects_<repo>_<run_id>_<timestamp>.tar.gz`
- **Content**: Compressed archive of `~/.claude/projects/` directory
