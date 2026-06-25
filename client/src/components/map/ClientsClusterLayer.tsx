import { Marker, Popup } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import { Building2, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

interface ClientSite {
  id: string;
  siteName: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  latitude: number;
  longitude: number;
  clientName: string;
  clientSegment: string | null;
  clientGroup: string | null;
}

interface ClientsClusterLayerProps {
  sites: ClientSite[];
  onSiteClick?: (site: ClientSite) => void;
  selectedSiteIds?: string[];
}

// Ícone azul customizado para clientes individuais
const clientIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Ícone verde para clientes selecionados
const selectedClientIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Função para criar ícones customizados para clusters
const createClusterCustomIcon = (cluster: L.MarkerCluster) => {
  const count = cluster.getChildCount();
  
  // Tamanhos baseados na quantidade
  let size: 'small' | 'medium' | 'large' = 'small';
  if (count >= 100) size = 'large';
  else if (count >= 10) size = 'medium';
  
  const sizeMap: Record<'small' | 'medium' | 'large', number> = {
    small: 40,
    medium: 50,
    large: 60
  };
  
  return L.divIcon({
    html: `
      <div style="
        background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
        border: 3px solid #ffffff;
        border-radius: 50%;
        width: ${sizeMap[size]}px;
        height: ${sizeMap[size]}px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: ${size === 'large' ? '18px' : size === 'medium' ? '16px' : '14px'};
        box-shadow: 0 4px 8px rgba(59, 130, 246, 0.3);
        transition: transform 0.2s;
      ">
        ${count}
      </div>
    `,
    className: 'custom-marker-cluster',
    iconSize: L.point(sizeMap[size], sizeMap[size], true)
  });
};

export function ClientsClusterLayer({ sites, onSiteClick, selectedSiteIds = [] }: ClientsClusterLayerProps) {
  if (sites.length === 0) {
    return null;
  }

  return (
    <MarkerClusterGroup
      chunkedLoading
      iconCreateFunction={createClusterCustomIcon}
      maxClusterRadius={60}
      spiderfyOnMaxZoom={true}
      showCoverageOnHover={true}
      zoomToBoundsOnClick={true}
      data-testid="clients-cluster-layer"
    >
      {sites.map((site) => {
        const isSelected = selectedSiteIds.includes(site.id);
        const markerIcon = isSelected ? selectedClientIcon : clientIcon;
        
        return (
          <Marker
            key={site.id}
            position={[site.latitude, site.longitude]}
            icon={markerIcon}
            eventHandlers={{
              click: () => {
                if (onSiteClick) {
                  onSiteClick(site);
                }
              },
            }}
            data-testid={`marker-client-${site.id}`}
          >
            <Popup>
              <div className="p-2 min-w-[200px]" data-testid={`popup-client-${site.id}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="h-4 w-4 text-blue-500" />
                  <p className="font-semibold">{site.clientName}</p>
                </div>

                {site.siteName && (
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    {site.siteName}
                  </p>
                )}

                {site.clientSegment && (
                  <Badge variant="outline" className="text-xs mb-2">
                    {site.clientSegment}
                  </Badge>
                )}

                {site.address && (
                  <p className="text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 inline mr-1" />
                    {site.address}
                  </p>
                )}

                {site.city && site.state && (
                  <p className="text-xs text-muted-foreground">
                    {site.city} - {site.state}
                  </p>
                )}

                {site.clientGroup && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Grupo: {site.clientGroup}
                  </p>
                )}

                {onSiteClick && (
                  <div className="mt-3 pt-2 border-t">
                    <p className="text-xs text-muted-foreground text-center">
                      {isSelected ? "✓ Selecionado para rota" : "Clique para adicionar à rota"}
                    </p>
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MarkerClusterGroup>
  );
}
