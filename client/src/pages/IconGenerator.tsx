import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download } from "lucide-react";

export default function IconGenerator() {
  const canvas192Ref = useRef<HTMLCanvasElement>(null);
  const canvas512Ref = useRef<HTMLCanvasElement>(null);
  const canvas180Ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      drawIcon(canvas192Ref.current, 192, img);
      drawIcon(canvas512Ref.current, 512, img);
      drawIcon(canvas180Ref.current, 180, img);
    };
    // Usa a nova imagem Renner anexada
    import("@assets/image_1762949934371.png").then((module) => {
      img.src = module.default;
    });
  }, []);

  const drawIcon = (canvas: HTMLCanvasElement | null, size: number, img: HTMLImageElement) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Fundo preto com bordas arredondadas
    const borderRadius = 16;
    ctx.fillStyle = "#000000";
    
    // Desenha retângulo com bordas arredondadas
    ctx.beginPath();
    ctx.moveTo(borderRadius, 0);
    ctx.lineTo(size - borderRadius, 0);
    ctx.quadraticCurveTo(size, 0, size, borderRadius);
    ctx.lineTo(size, size - borderRadius);
    ctx.quadraticCurveTo(size, size, size - borderRadius, size);
    ctx.lineTo(borderRadius, size);
    ctx.quadraticCurveTo(0, size, 0, size - borderRadius);
    ctx.lineTo(0, borderRadius);
    ctx.quadraticCurveTo(0, 0, borderRadius, 0);
    ctx.closePath();
    ctx.fill();

    // Desenhar logo centralizado (85% do tamanho)
    const logoSize = size * 0.85;
    const offset = (size - logoSize) / 2;
    ctx.drawImage(img, offset, offset, logoSize, logoSize);
  };

  const downloadCanvas = (canvasRef: React.RefObject<HTMLCanvasElement>, filename: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = filename;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Instruções</CardTitle>
          <CardDescription>
            Clique nos botões abaixo para baixar cada ícone
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Baixe os 3 ícones clicando nos botões</li>
            <li>Os arquivos serão salvos automaticamente no seu computador</li>
            <li>Envie os arquivos baixados de volta no chat</li>
            <li>Eles serão automaticamente instalados no projeto</li>
          </ol>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">192x192</CardTitle>
            <CardDescription>Ícone PWA pequeno</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center bg-muted p-4 rounded-lg">
              <canvas
                ref={canvas192Ref}
                width={192}
                height={192}
                className="border-2 border-border rounded-lg shadow-sm"
                style={{ maxWidth: "192px", height: "auto" }}
              />
            </div>
            <Button
              onClick={() => downloadCanvas(canvas192Ref, "pwa-192x192.png")}
              className="w-full"
              data-testid="button-download-192"
            >
              <Download className="h-4 w-4 mr-2" />
              Baixar 192x192
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">512x512</CardTitle>
            <CardDescription>Ícone PWA grande</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center bg-muted p-4 rounded-lg">
              <canvas
                ref={canvas512Ref}
                width={512}
                height={512}
                className="border-2 border-border rounded-lg shadow-sm"
                style={{ maxWidth: "192px", height: "auto" }}
              />
            </div>
            <Button
              onClick={() => downloadCanvas(canvas512Ref, "pwa-512x512.png")}
              className="w-full"
              data-testid="button-download-512"
            >
              <Download className="h-4 w-4 mr-2" />
              Baixar 512x512
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">180x180</CardTitle>
            <CardDescription>Ícone Apple (iOS)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center bg-muted p-4 rounded-lg">
              <canvas
                ref={canvas180Ref}
                width={180}
                height={180}
                className="border-2 border-border rounded-lg shadow-sm"
                style={{ maxWidth: "180px", height: "auto" }}
              />
            </div>
            <Button
              onClick={() => downloadCanvas(canvas180Ref, "apple-touch-icon.png")}
              className="w-full"
              data-testid="button-download-apple"
            >
              <Download className="h-4 w-4 mr-2" />
              Baixar Apple Icon
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6" style={{ backgroundColor: "#d31527", color: "white" }}>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 bg-white/10 rounded-lg flex items-center justify-center">
              <img src="/renner-logo.png" alt="Renner" className="h-12 w-12 object-contain" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Preview do Tema PWA</h3>
              <p className="text-sm opacity-90">
                Assim ficará a barra superior do app no celular (Android)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
