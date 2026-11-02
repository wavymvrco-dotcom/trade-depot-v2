
import { addMinutes, format, subMinutes } from "date-fns";

export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface NewsItem {
  id: string;
  time: string;
  title: string;
  impact: "High" | "Medium" | "Low";
  currency: string;
  forecast?: string;
  previous?: string;
}

export const MOCK_CANDLES: Candle[] = Array.from({ length: 50 }).map((_, i) => {
  const basePrice = 1.0850;
  const volatility = 0.0010;
  // Generate a somewhat random walk
  const open = basePrice + Math.sin(i * 0.2) * volatility + (Math.random() - 0.5) * 0.0005;
  const close = open + (Math.random() - 0.5) * 0.0008;
  const high = Math.max(open, close) + Math.random() * 0.0003;
  const low = Math.min(open, close) - Math.random() * 0.0003;
  
  return {
    time: format(subMinutes(new Date(), (50 - i) * 15), "HH:mm"),
    open,
    high,
    low,
    close,
  };
});

export const MOCK_NEWS: NewsItem[] = [
  {
    id: "1",
    time: format(addMinutes(new Date(), 10), "HH:mm"),
    title: "USD Fed Interest Rate Decision",
    impact: "High",
    currency: "USD",
    forecast: "5.50%",
    previous: "5.50%"
  },
  {
    id: "2",
    time: format(addMinutes(new Date(), 45), "HH:mm"),
    title: "EUR ECB Press Conference",
    impact: "High",
    currency: "EUR"
  },
  {
    id: "3",
    time: format(subMinutes(new Date(), 30), "HH:mm"),
    title: "USD Core PPI m/m",
    impact: "Medium",
    currency: "USD",
    forecast: "0.2%",
    previous: "0.3%"
  },
  {
    id: "4",
    time: format(subMinutes(new Date(), 120), "HH:mm"),
    title: "JPY Monetary Policy Statement",
    impact: "High",
    currency: "JPY"
  }
];

export const MOCK_TRADES = [
  { id: "t1", symbol: "EURUSD", type: "buy", size: 0.10, price: 1.0845, sl: 1.0820, tp: 1.0890, profit: 12.50 },
  { id: "t2", symbol: "GBPUSD", type: "sell", size: 0.50, price: 1.2630, sl: 1.2660, tp: 1.2580, profit: -4.20 },
];
