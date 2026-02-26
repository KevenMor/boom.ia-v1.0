import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export default function Login() {
  const navigate = useNavigate();
  const { signIn, user } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Redirect if already logged in
  if (user) {
    navigate("/dashboard", { replace: true });
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      toast.error("Falha no login: " + error.message);
    } else {
      navigate("/dashboard");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      {/* Background subtle grid */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(hsl(var(--primary)/0.08)_1px,transparent_1px)] [background-size:24px_24px]" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative w-full max-w-sm"
      >
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary font-mono text-lg font-bold text-primary-foreground glow-primary">
            N
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Nexus AI</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Plataforma de Agentes Inteligentes
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border bg-card p-6">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="admin@empresa.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 bg-background"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Senha
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10 bg-background pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button type="submit" className="w-full h-10 gap-2" disabled={loading}>
            {loading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
            ) : (
              <>
                Entrar
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>

          <button type="button" className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors">
            Esqueceu a senha?
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Nexus AI Platform v1.0
        </p>
      </motion.div>
    </div>
  );
}
