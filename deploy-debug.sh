#!/bin/bash
cd /root/astec-project
git pull
npm run build
docker restart astec-app
