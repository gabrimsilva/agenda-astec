const ssh2 = require('ssh2');
const fs = require('fs');
const path = require('path');

const conn = new ssh2.Client();

conn.on('ready', function() {
  console.log('[+] Conectado!');
  
  // Fazer upload dos arquivos
  conn.sftp(function(err, sftp) {
    if (err) throw err;
    
    function uploadDir(localDir, remoteDir) {
      const files = fs.readdirSync(localDir);
      
      files.forEach(file => {
        const localPath = path.join(localDir, file);
        const remotePath = remoteDir + file;
        const stats = fs.statSync(localPath);
        
        if (stats.isDirectory()) {
          sftp.mkdir(remotePath, (err) => {
            if (err && err.code !== 2) throw err;
            uploadDir(localPath + '/', remotePath + '/');
          });
        } else {
          console.log(`  -> ${file}`);
          sftp.fastPut(localPath, remotePath, (err) => {
            if (err) throw err;
          });
        }
      });
    }
    
    console.log('[*] Fazendo upload...');
    uploadDir('dist/', '/home/astec/app/dist/');
    
    setTimeout(() => {
      sftp.end();
      
      // Executar comandos
      conn.exec('cd /home/astec/app && docker cp dist/. astec-app:/app/dist/ && docker restart astec-app', 
        function(err, stream) {
          if (err) throw err;
          stream.on('close', function(code, signal) {
            console.log('[+] Deploy completo!');
            conn.end();
          });
          stream.on('data', function(data) {
            console.log(data.toString());
          });
        });
    }, 2000);
  });
}).on('error', function(err) {
  console.error('[-] Erro:', err);
});

conn.connect({
  host: '10.3.1.135',
  port: 22,
  username: 'root',
  password: 'superrhsa@#2018!'
});
