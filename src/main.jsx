import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import TradeAIPro from './TradeAIPro.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
   <TradeAIPro />
  </StrictMode>,
)
