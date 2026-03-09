import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin } from "lucide-react";
import type { GeographicData } from "@/hooks/useEcosystemTimeline";
import { LeafletMap } from "./LeafletMap";

interface SafeGeographicMapProps {
  data: GeographicData[];
  title: string;
  description: string;
  type: "licensee" | "machine" | "event" | "all";
  isLoading?: boolean;
  onStateClick?: (stateSigla: string) => void;
  selectedState?: string | null;
}

function MapLoadingFallback({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <MapPin className="h-4 w-4 text-carbo-green" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </CardContent>
    </Card>
  );
}

export function SafeGeographicMap({ data, title, description, type, isLoading, onStateClick, selectedState }: SafeGeographicMapProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      setIsMounted(true);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  if (!isMounted || isLoading) {
    return <MapLoadingFallback title={title} description={description} />;
  }

  return (
    <LeafletMap
      data={data}
      title={title}
      description={description}
      type={type}
      isLoading={isLoading}
      onStateClick={onStateClick}
      selectedState={selectedState}
    />
  );
}
