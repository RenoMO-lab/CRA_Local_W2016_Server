import React, { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Lock, Mail } from "lucide-react";
import LanguageSelector from "@/components/LanguageSelector";
const Login: React.FC = () => {
  const navigate = useNavigate();
  const {
    login,
    isAuthenticated,
    isLoading
  } = useAuth();
  const {
    t
  } = useLanguage();
  const {
    toast
  } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await login(email, password);
    if (success) {
      toast({
        title: t.auth.loginSuccess,
        description: t.auth.loginSuccessDesc
      });
      navigate("/dashboard");
    } else {
      toast({
        title: t.auth.loginFailed,
        description: t.auth.loginFailedDesc,
        variant: "destructive"
      });
    }
  };
  return <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 login-hero">
        <div>
          <div className="flex items-center gap-3">
            <img 
              src="/monroc-logo.png" 
              alt="Monroc" 
              className="max-h-32 w-auto object-contain" 
              onError={e => {
                e.currentTarget.style.display = "none";
              }} 
            />
          </div>
        </div>

        <div className="space-y-6">
          <h1 className="text-4xl font-bold login-hero-title leading-tight">
            {t.branding.customerRequest}
            <br />
            {t.branding.analysisPlatform}
          </h1>
          <p className="text-lg login-hero-text max-w-md">{t.branding.tagline}</p>

          <div className="grid grid-cols-2 gap-4 pt-8">
            <div className="p-4 rounded-lg login-hero-card backdrop-blur">
              <h3 className="text-2xl login-hero-title font-normal">{t.branding.performanceAxles}</h3>
              <p className="text-sm text-primary font-bold text-justify">{t.branding.requestsProcessed}</p>
            </div>
            <div className="p-4 rounded-lg login-hero-card backdrop-blur">
              <h3 className="text-2xl font-bold login-hero-title">{t.branding.axlesForAllMarkets}</h3>
              
            </div>
          </div>
        </div>

        <p className="text-sm login-hero-text">{t.branding.copyright}</p>
      </div>

      {/* Right side - Login form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md space-y-8 animate-slide-up">
          {/* Language Selector */}
          <div className="flex justify-end">
            <LanguageSelector />
          </div>

          <div className="text-center lg:text-left">
            <div className="lg:hidden flex items-center justify-center gap-3 mb-4">
              <img 
                src="/monroc-logo.png" 
                alt="Monroc" 
                className="max-h-24 w-auto object-contain"
                onError={e => {
                  e.currentTarget.style.display = "none";
                }} 
              />
            </div>
            <h2 className="text-3xl font-bold text-foreground">{t.auth.welcomeBack}</h2>
            <p className="mt-2 text-muted-foreground">{t.auth.signInDescription}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                {t.auth.emailAddress}
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t.auth.enterEmail} className="pl-10" required />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                {t.common.password}
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={t.auth.enterPassword} className="pl-10" required />
              </div>
            </div>

            <Button type="submit" className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-medium" disabled={isLoading}>
              {isLoading ? <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t.auth.signingIn}
                </> : t.auth.signIn}
            </Button>
          </form>

        </div>
      </div>
    </div>;
};
export default Login;
