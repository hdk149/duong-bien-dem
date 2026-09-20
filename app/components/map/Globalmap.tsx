"use client";

import "leaflet/dist/leaflet.css";

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
} from "react-leaflet";

import type { LatLngExpression } from "leaflet";

type MapPlayer = {
  id: string;
  name: string;
  lat: number;
  lon: number;
};

type GlobalMapProps = {
  players?: MapPlayer[];
};

const center: LatLngExpression = [20, 0];

export default function GlobalMap({
  players = [],
}: GlobalMapProps) {
  return (
    <div className="w-full h-[500px] overflow-hidden rounded-2xl border border-white/10">
      <MapContainer
        center={center}
        zoom={2}
        minZoom={2}
        maxZoom={8}
        scrollWheelZoom={true}
        className="w-full h-full"
      >
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {players.map((player) => (
          <Marker
            key={player.id}
            position={[player.lat, player.lon]}
          >
            <Popup>
              <strong>{player.name}</strong>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}