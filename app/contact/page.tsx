export default function Contact() {
  return (
    <main>
      {/* Title */}
      <div className="text-center">
        <h1 className="text-6xl font-thin mb-6">CONTACT</h1>
      </div>

      <div className="m-0 max-w-[30ch] text-xl leading-relaxed mt-8 opacity-75">
        <ul className="list-disc list-inside">
          <li className="mb-6">
            <span className="font-semibold uppercase text-3xl">
              Dr. Juyong Lee
            </span>
            <br />
            Assistant Professor at Seoul National University
            <br />
            <a
              href="mailto:nicole23@snu.ac.kr"
              className="text-blue-300 hover:text-blue-500 transition-colors"
            >
              nicole23@snu.ac.kr
            </a>
          </li>
          <li>
            <span className="font-semibold uppercase text-3xl">John Seong</span>
            <br />
            Lead Developer, Undergraduate/Undeclared Major at University of
            California, Irvine
            <br />
            <a
              href="mailto:wonmos@uci.edu"
              className="text-blue-300 hover:text-blue-500 transition-colors"
            >
              wonmos@uci.edu
            </a>
          </li>
        </ul>
      </div>
    </main>
  );
}
