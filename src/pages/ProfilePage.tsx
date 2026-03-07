import { useState } from "react";
import { User, Lock, Camera, Loader2, Mail, Shield } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { nexusDb as supabase } from "@/integrations/supabase/nexus-client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useRef } from "react";

const AVATAR_KEY = "boomia_user_avatar";

export default function ProfilePage() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => {
    try { return localStorage.getItem(AVATAR_KEY); } catch { return null; }
  });
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const initials = user?.email?.slice(0, 2).toUpperCase() ?? "AD";

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) {
      toast.error("Preencha todos os campos de senha");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("A nova senha deve ter no mínimo 6 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }

    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Senha alterada com sucesso!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast.error("Erro ao alterar senha: " + (err.message ?? "desconhecido"));
    } finally {
      setChangingPassword(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Imagem deve ter no máximo 2MB");
      return;
    }

    setUploadingAvatar(true);
    try {
      // Convert to base64 and store locally (no storage bucket needed)
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        localStorage.setItem(AVATAR_KEY, dataUrl);
        setAvatarUrl(dataUrl);
        toast.success("Foto de perfil atualizada!");
        setUploadingAvatar(false);
      };
      reader.onerror = () => {
        toast.error("Erro ao ler imagem");
        setUploadingAvatar(false);
      };
      reader.readAsDataURL(file);
    } catch {
      toast.error("Erro ao fazer upload da foto");
      setUploadingAvatar(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Meu Perfil</h2>
        <p className="text-sm text-muted-foreground">Gerencie suas informações pessoais e segurança</p>
      </div>

      {/* Avatar & Info */}
      <Card className="border-border bg-card p-6">
        <div className="flex items-center gap-2 text-sm font-semibold mb-4">
          <User className="h-4 w-4 text-muted-foreground" />
          Informações pessoais
        </div>

        <div className="flex items-center gap-5">
          <div className="relative group">
            <Avatar className="h-20 w-20 cursor-pointer" onClick={() => fileRef.current?.click()}>
              <AvatarImage src={avatarUrl ?? undefined} alt="Avatar" />
              <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-lg font-bold text-primary-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div
              className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 cursor-pointer"
              onClick={() => fileRef.current?.click()}
            >
              {uploadingAvatar ? (
                <Loader2 className="h-5 w-5 animate-spin text-white" />
              ) : (
                <Camera className="h-5 w-5 text-white" />
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarUpload}
            />
          </div>

          <div className="flex-1 space-y-3">
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Mail className="h-3 w-3" /> E-mail
              </Label>
              <Input
                value={user?.email ?? "—"}
                disabled
                className="h-9 bg-muted/50 max-w-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Shield className="h-3 w-3" /> Função
              </Label>
              <Input
                value="Administrador"
                disabled
                className="h-9 bg-muted/50 max-w-[200px]"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Change Password */}
      <Card className="border-border bg-card p-6">
        <div className="flex items-center gap-2 text-sm font-semibold mb-4">
          <Lock className="h-4 w-4 text-muted-foreground" />
          Alterar senha
        </div>

        <div className="space-y-3 max-w-sm">
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Nova senha</Label>
            <Input
              type="password"
              placeholder="Mínimo 6 caracteres"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="h-9 bg-background"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Confirmar nova senha</Label>
            <Input
              type="password"
              placeholder="Repita a nova senha"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="h-9 bg-background"
            />
          </div>
          <Button
            onClick={handleChangePassword}
            disabled={changingPassword || !newPassword || !confirmPassword}
            className="mt-2"
          >
            {changingPassword ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Alterando...
              </>
            ) : (
              "Alterar senha"
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}
