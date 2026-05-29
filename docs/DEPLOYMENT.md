# Deployment Notes

## Docker Swarm binary replacement

When Relay is deployed as a mounted binary in Docker Swarm, back up the SQLite
database before replacing the release executable and recreating the service.

Example:

```bash
cd /home/user/relay
cp relay.db "relay.db.$(date +%Y%m%d%H%M%S).bak"
tar -xzf relay-linux-amd64.tar.gz
docker stack deploy -c docker-stack.yml relay
```

The database is the source of truth for workspaces, flows, requests, scripts,
history, and uploaded-file metadata. If a migration or deployment fails after a
new binary starts, restore from the latest `relay.db.*.bak` before retrying.

For production deployments, prefer building a versioned Docker image that
contains the Relay binary and deploying that image tag. Reusing the same image
while replacing a mounted executable works, but it makes rollback and audit
trails harder because the image digest does not identify the running binary.
