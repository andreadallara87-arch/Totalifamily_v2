import Conti from './Conti.jsx'
import Andamento from './Andamento.jsx'

/**
 * Situazione patrimoniale: patrimonio netto e debiti, poi conti, carte e finanziamenti uno per uno,
 * in fondo entrate e spese mese per mese (quanto è rimasto).
 */
export default function Patrimonio({ data, today, go, onAssets, showToast, onEditCard }) {
  return (
    <>
      <Andamento part="worth" data={data} today={today} go={go} onAssets={onAssets} showToast={showToast} />
      <Conti data={data} today={today} onEditCard={onEditCard} />
      <Andamento part="flows" data={data} today={today} go={go} onAssets={onAssets} showToast={showToast} />
    </>
  )
}
