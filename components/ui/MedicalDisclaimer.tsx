export default function MedicalDisclaimer() {
  return (
    <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <span className="text-lg leading-none">&#9877;&#65039;</span>
      <p>
        이 정보는 참고 목적으로 제공되며, 의료 전문가의 진단이나 처방을 대체할 수
        없습니다. 건강 관련 결정은 반드시 전문 의료진과 상담하시기 바랍니다.
      </p>
    </div>
  );
}
