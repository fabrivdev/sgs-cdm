import { Navigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";

export default function SinAcceso() {
  const { defaultRoute } = useAuth();
  if (defaultRoute !== "/sin-acceso") return <Navigate to={defaultRoute} replace />;

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <Card className="max-w-md text-center">
        <CardContent className="space-y-3 p-8">
          <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Sin módulos asignados</h1>
          <p className="text-sm text-muted-foreground">
            Tu cuenta está activa, pero todavía no tiene acceso a un módulo. Solicita la asignación a un administrador.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
