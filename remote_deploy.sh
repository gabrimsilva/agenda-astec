cd /home/astec/app
rm -rf dist-new
cp -r dist dist-new
docker cp dist/. astec-app:/app/dist/
docker restart astec-app
echo "Deploy completo!"
