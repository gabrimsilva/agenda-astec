#!/bin/bash
cd /home/astec/app
docker cp dist/. astec-app:/app/dist/
docker restart astec-app
