import { Construction } from "lucide-react";

// Página temporária — área recém-movida para o Admin, montada aos poucos.
export default function Placeholder({ title, description }: { title: string; description?: string }) {
  return (
    <div className="p-6">
      <div className="max-w-xl mx-auto mt-16 text-center">
        <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Construction className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {description ?? "Em organização — esta área está sendo montada no Carbo Admin."}
        </p>
      </div>
    </div>
  );
}
