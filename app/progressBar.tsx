export default function ProgressBar(props: { pointer: number }) {
    const { pointer } = props;
  
    return (
      <div
        className="p-3 opacity-75 text-gray-900 text-center bg-white fixed bottom-0 rounded-3xl"
        style={{ left: "50%", transform: "translate(-50%, -50%)" }}
      >
        <div className="scale-90 sm:scale-100 flex overflow-hidden rounded-xl">
          <div className={`flex-1 p-2 ${pointer >= 1 ? 'bg-transparent' : 'bg-gray-300'}`}>PROTEIN</div>
          <div className={`flex-1 p-2 ${pointer >= 2 ? 'bg-transparent' : 'bg-gray-300'}`}>MARINATE</div>
          <div className={`flex-1 p-2 ${pointer >= 3 ? 'bg-transparent' : 'bg-gray-300'}`}>LIGAND</div>
          <div className={`flex-1 p-2 ${pointer === 4 ? 'bg-transparent' : 'bg-gray-300'}`}>COOK</div>
        </div>
      </div>
    );
  }
  