import EmergencyControls from "../../../components/EmergencyControls";
import ServerControls from "../../../components/developer/ServerControls";

export default function DevControlCenter({
  params,
}: {
  params: { code: string };
}) {
  const roomCode = params.code;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">
        ⚙️ Control Center: Phòng {roomCode}
      </h1>

      <div className="mb-6">
        <p>✅ 4. Player Inspector</p>
        <p>✅ 5. Kick / Ban</p>
        <p>✅ 6. Vote / Resolve protection</p>
      </div>

      {/* Emergency = floating warning button */}
      <EmergencyControls roomCode={roomCode} />

      {/* Server Controls = panel riêng */}
      <div className="mt-8">
        <ServerControls roomCode={roomCode} />
      </div>
    </div>
  );
}