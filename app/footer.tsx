import Link from "next/link";

export default function Footer(props: {
  destination: string;
  message: string;
}) {
  return (
    <div
      className="p-3 opacity-75 text-gray-900 text-center bg-white fixed bottom-0 rounded-3xl"
      style={{ left: "50%", transform: "translate(-50%, -50%)" }}
    >
      <div className="scale-90 sm:scale-100">
        <Link href={props.destination}>
          <span className="text-lg md:text-xl">{props.message}</span>
        </Link>
      </div>
    </div>
  );
}
