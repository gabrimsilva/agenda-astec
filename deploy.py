import paramiko
import os
import sys

host = "10.3.1.135"
port = 22
username = "root"
password = "superrhsa@#2018!"
local_path = r"c:\Users\gmsilva\Desktop\SISTEMAS\_RODANDO\astec-project\dist"
remote_path = "/home/astec/app/"

try:
    # Criar cliente SSH
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    # Conectar
    print(f"[*] Conectando a {host}...")
    ssh.connect(host, port=port, username=username, password=password, timeout=10)
    print("[+] Conectado!")
    
    # Usar SFTP para fazer upload
    sftp = ssh.open_sftp()
    print(f"[*] Fazendo upload de {local_path}...")
    
    def upload_folder(sftp, local_dir, remote_dir):
        for item in os.listdir(local_dir):
            local_item = os.path.join(local_dir, item)
            remote_item = f"{remote_dir}{item}"
            
            if os.path.isdir(local_item):
                try:
                    sftp.mkdir(remote_item)
                except:
                    pass
                upload_folder(sftp, local_item, f"{remote_item}/")
            else:
                print(f"  -> {item}")
                sftp.put(local_item, remote_item)
    
    upload_folder(sftp, local_path, remote_path)
    sftp.close()
    
    # Executar comandos na VM
    print("[*] Executando comandos na VM...")
    commands = [
        "cd /home/astec/app",
        "docker cp dist/. astec-app:/app/dist/",
        "docker restart astec-app"
    ]
    
    for cmd in commands:
        print(f"  > {cmd}")
        stdin, stdout, stderr = ssh.exec_command(cmd)
        print(stdout.read().decode())
    
    ssh.close()
    print("[+] Deploy completo!")
    
except Exception as e:
    print(f"[-] Erro: {e}")
    sys.exit(1)
