import Link from "next/link";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

const steps = [
  { label: "PROTEIN", step: 1 },
  { label: "PREPARE", step: 2 },
  { label: "LIGAND", step: 3 },
  { label: "DOCK", step: 4 },
];

export default function ProgressBar(props: {
  pointer: number;
  backLink?: string;
  backLinkParams?: { [key: string]: string };
  nextLink?: string;
  nextLinkParams?: { [key: string]: string };
}) {
  const { pointer } = props;

  return (
    <div
      className="fixed bottom-0"
      style={{ left: "50%", transform: "translate(-50%, -50%)" }}
    >
      <div className="flex flex-col md:flex-row gap-2">
        {props.backLink && props.backLinkParams && (
          <Link
            style={{ width: "fit-content" }}
            href={{
              pathname: props.backLink,
              query: props.backLinkParams,
            }}
            className="self-start md:self-center flex flex-row gap-4 items-center justify-center p-3 scale-75 text-gray-900 text-center bg-white rounded-3xl"
          >
            <ArrowBackIcon />
            <span className="text-lg md:text-xl">BACK</span>
          </Link>
        )}
        <div className="p-3 opacity-75 text-gray-900 text-center bg-white rounded-3xl">
          <div className="scale-90 sm:scale-100 flex overflow-hidden rounded-xl">
            {steps.map((s) => (
              <div
                key={s.step}
                className={`flex-1 p-2 text-sm ${
                  pointer === s.step ? "bg-transparent font-semibold" : "bg-gray-300"
                } ${pointer > s.step ? "text-green-700" : ""}`}
              >
                {s.label}
              </div>
            ))}
          </div>
        </div>
        {props.nextLink && props.nextLinkParams && (
          <Link
            style={{ width: "fit-content" }}
            href={{
              pathname: props.nextLink,
              query: props.nextLinkParams,
            }}
            className="self-end md:self-center flex flex-row gap-4 items-center justify-center p-3 scale-75 text-gray-900 text-center bg-white rounded-3xl"
          >
            <span className="text-lg md:text-xl">NEXT</span>
            <ArrowForwardIcon />
          </Link>
        )}
      </div>
    </div>
  );
}
