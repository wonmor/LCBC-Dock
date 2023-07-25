import Link from "next/link";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

export default function ProgressBar(props: {
  pointer: number;
  backLink?: String;
  backLinkParams?: { [key: string]: string };
  nextLink?: String;
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
              pathname: props.backLink as string,
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
            <div
              className={`flex-1 p-2 ${
                pointer === 1 ? "bg-transparent" : "bg-gray-300"
              }`}
            >
              PROTEIN
            </div>
            <div
              className={`flex-1 p-2 ${
                pointer === 2 ? "bg-transparent" : "bg-gray-300"
              }`}
            >
              MARINATE
            </div>
            <div
              className={`flex-1 p-2 ${
                pointer === 3 ? "bg-transparent" : "bg-gray-300"
              }`}
            >
              LIGAND
            </div>
            <div
              className={`flex-1 p-2 ${
                pointer === 4 ? "bg-transparent" : "bg-gray-300"
              }`}
            >
              COOK
            </div>
          </div>
        </div>
        {props.nextLink && props.nextLinkParams && (
          <Link
            style={{ width: "fit-content" }}
            href={{
              pathname: props.nextLink as string,
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
