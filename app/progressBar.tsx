export default function ProgressBar(props: {
  pointer: number;
}) {
  return (
    <div
      className="p-3 opacity-75 text-gray-900 text-center bg-white fixed bottom-0 rounded-3xl"
      style={{ left: "50%", transform: "translate(-50%, -50%)" }}
    >
      <div className="scale-90 sm:scale-100">

      </div>
    </div>
  );
}
