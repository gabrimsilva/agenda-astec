import { useRef, useState } from "react";
import { User, Mail, Phone, MapPin, LogOut, Settings, Camera, Trash2, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Technician } from "@shared/schema";

export default function Profile() {
  const { user, logout, refreshUser } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const { data: technicians } = useQuery<Technician[]>({
    queryKey: ["/api/technicians"],
    enabled: !!user,
  });

  const userTechnician = technicians?.find((tech) => tech.userId === user?.id);

  const uploadAvatarMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("avatar", file);
      
      const response = await fetch(`/api/users/${user!.id}/avatar`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("astec_token")}`,
        },
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erro ao fazer upload");
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Avatar atualizado",
        description: "Sua foto foi atualizada com sucesso!",
      });
      refreshUser();
      queryClient.invalidateQueries({ queryKey: ["/api/technicians"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar avatar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteAvatarMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/users/${user!.id}/avatar`);
    },
    onSuccess: () => {
      toast({
        title: "Avatar removido",
        description: "Sua foto foi removida com sucesso!",
      });
      refreshUser();
      queryClient.invalidateQueries({ queryKey: ["/api/technicians"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao remover avatar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleLogout = () => {
    logout();
    setLocation("/login");
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Arquivo muito grande",
        description: "O tamanho máximo é 5MB",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      await uploadAvatarMutation.mutateAsync(file);
    } finally {
      setIsUploading(false);
      // Reset input so same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDeleteAvatar = () => {
    deleteAvatarMutation.mutate();
  };

  const roleLabels = {
    admin: "Administrador",
    assistente: "Técnico",
  };

  if (!user) {
    return null;
  }

  const avatarUrl = user.avatarUrl || userTechnician?.avatarUrl;
  const hasAvatar = !!avatarUrl;

  return (
    <div className="max-w-2xl mx-auto space-y-3 lg:space-y-4">
      <Card data-testid="card-profile-header">
        <CardHeader className="p-4 lg:p-6">
          <div className="flex items-center gap-3 lg:gap-4">
            {/* Avatar with upload functionality */}
            <div className="relative group">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handleFileChange}
                className="hidden"
                data-testid="input-avatar-file"
              />
              <Avatar 
                className="h-16 w-16 lg:h-20 lg:w-20 cursor-pointer ring-2 ring-transparent hover:ring-primary/50 transition-all"
                onClick={handleAvatarClick}
                data-testid="button-avatar-upload"
              >
                <AvatarImage src={avatarUrl || ""} alt={user.name} />
                <AvatarFallback className="text-lg lg:text-xl" data-testid="avatar-initials">
                  {user.name.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              
              {/* Overlay on hover */}
              <div 
                className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                onClick={handleAvatarClick}
              >
                {isUploading ? (
                  <Loader2 className="h-6 w-6 text-white animate-spin" />
                ) : (
                  <Camera className="h-6 w-6 text-white" />
                )}
              </div>
            </div>
            
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg lg:text-xl truncate" data-testid="text-user-name">{user.name}</CardTitle>
              <Badge variant="secondary" className="mt-1 text-xs" data-testid="badge-user-role">
                {roleLabels[user.role as keyof typeof roleLabels]}
              </Badge>
              
              {/* Delete avatar button */}
              {hasAvatar && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 text-xs text-muted-foreground hover:text-destructive"
                  onClick={handleDeleteAvatar}
                  disabled={deleteAvatarMutation.isPending}
                  data-testid="button-delete-avatar"
                >
                  {deleteAvatarMutation.isPending ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3 mr-1" />
                  )}
                  Remover foto
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card data-testid="card-profile-info">
        <CardHeader className="p-4 lg:p-6 pb-2 lg:pb-3">
          <CardTitle className="text-sm lg:text-base">Informações</CardTitle>
        </CardHeader>
        <CardContent className="p-4 lg:p-6 pt-0 space-y-2 lg:space-y-3">
          <div className="flex items-center gap-2.5 lg:gap-3 p-2.5 lg:p-3 rounded-lg bg-muted/50" data-testid="info-name">
            <User className="h-4 w-4 lg:h-5 lg:w-5 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs lg:text-sm text-muted-foreground">Nome</p>
              <p className="text-sm lg:text-base font-medium truncate" data-testid="text-name-value">{user.name}</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 lg:gap-3 p-2.5 lg:p-3 rounded-lg bg-muted/50" data-testid="info-email">
            <Mail className="h-4 w-4 lg:h-5 lg:w-5 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs lg:text-sm text-muted-foreground">E-mail</p>
              <p className="text-sm lg:text-base font-medium truncate" data-testid="text-email-value">{user.email}</p>
            </div>
          </div>

          {userTechnician && (
            <>
              <div className="flex items-center gap-2.5 lg:gap-3 p-2.5 lg:p-3 rounded-lg bg-muted/50" data-testid="info-phone">
                <Phone className="h-4 w-4 lg:h-5 lg:w-5 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs lg:text-sm text-muted-foreground">Telefone</p>
                  <p className="text-sm lg:text-base font-medium" data-testid="text-phone-value">{userTechnician.phone}</p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 lg:gap-3 p-2.5 lg:p-3 rounded-lg bg-muted/50" data-testid="info-region">
                <MapPin className="h-4 w-4 lg:h-5 lg:w-5 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs lg:text-sm text-muted-foreground">Base</p>
                  <p className="text-sm lg:text-base font-medium" data-testid="text-region-value">{userTechnician.baseCity}</p>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="space-y-2">
        <Button variant="outline" className="w-full" size="default" data-testid="button-settings">
          <Settings className="h-4 w-4 mr-2" />
          Configurações
        </Button>
        <Button 
          variant="destructive" 
          className="w-full" 
          size="default" 
          onClick={handleLogout}
          data-testid="button-logout"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sair
        </Button>
      </div>
    </div>
  );
}
