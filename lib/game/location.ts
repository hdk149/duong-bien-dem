export type GameLocation = {
  id: string;
  name: string;
  lat: number;
  lng: number;
};

export const VIETNAM_LOCATIONS: GameLocation[] = [
  {
    id: "hanoi",
    name: "Hà Nội",
    lat: 21.0285,
    lng: 105.8542,
  },
  {
    id: "haiphong",
    name: "Hải Phòng",
    lat: 20.8449,
    lng: 106.6881,
  },
  {
    id: "quangninh",
    name: "Quảng Ninh",
    lat: 21.0064,
    lng: 107.2925,
  },
  {
    id: "vinh",
    name: "Vinh",
    lat: 18.6796,
    lng: 105.6813,
  },
  {
    id: "hue",
    name: "Huế",
    lat: 16.4637,
    lng: 107.5909,
  },
  {
    id: "danang",
    name: "Đà Nẵng",
    lat: 16.0544,
    lng: 108.2022,
  },
  {
    id: "nhatrang",
    name: "Nha Trang",
    lat: 12.2388,
    lng: 109.1967,
  },
  {
    id: "dalat",
    name: "Đà Lạt",
    lat: 11.9404,
    lng: 108.4583,
  },
  {
    id: "hcm",
    name: "TP. Hồ Chí Minh",
    lat: 10.8231,
    lng: 106.6297,
  },
  {
    id: "cantho",
    name: "Cần Thơ",
    lat: 10.0452,
    lng: 105.7469,
  },
];