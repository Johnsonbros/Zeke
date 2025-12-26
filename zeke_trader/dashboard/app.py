"""
Streamlit dashboard for ZEKE Trader.
Shows equity curve, decisions, trades, and positions.
"""
import streamlit as st
import pandas as pd
from pathlib import Path
import sys
import os

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from zeke_trader.config import load_config
from zeke_trader.logger import TradingLogger
from zeke_trader.metrics import TradingMetrics
from zeke_trader.broker_mcp import AlpacaBroker


st.set_page_config(
    page_title="ZEKE Trader Dashboard",
    page_icon="chart_with_upwards_trend",
    layout="wide",
    initial_sidebar_state="expanded"
)

@st.cache_resource
def get_config():
    return load_config()


def main():
    st.title("ZEKE Trader Dashboard")
    
    try:
        cfg = get_config()
    except Exception as e:
        st.error(f"Failed to load config: {e}")
        return
    
    logger = TradingLogger(cfg)
    metrics = TradingMetrics(cfg)
    
    with st.sidebar:
        st.header("Trading Mode")
        mode_color = {
            "paper": "blue",
            "shadow": "orange", 
            "live": "red"
        }.get(cfg.trading_mode.value, "gray")
        st.markdown(f"**:{mode_color}[{cfg.trading_mode.value.upper()}]**")
        st.caption(cfg.get_mode_description())
        
        st.divider()
        st.header("Settings")
        st.text(f"Max $/Trade: ${cfg.max_dollars_per_trade}")
        st.text(f"Max Positions: {cfg.max_open_positions}")
        st.text(f"Max Trades/Day: {cfg.max_trades_per_day}")
        st.text(f"Max Daily Loss: ${cfg.max_daily_loss}")
        
        st.divider()
        st.header("Allowed Symbols")
        st.text(", ".join(cfg.allowed_symbols))
        
        if st.button("Refresh", use_container_width=True):
            st.rerun()
    
    summary = metrics.get_summary()
    
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        st.metric("Current Equity", f"${summary['current_equity']:,.2f}")
    with col2:
        pnl = summary['total_pnl']
        st.metric("Total P&L", f"${pnl:,.2f}", delta=f"${pnl:,.2f}" if pnl != 0 else None)
    with col3:
        st.metric("Trades Today", summary['trades_today'])
    with col4:
        st.metric("Risk Blocks", summary['risk_blocks_total'])
    
    col_left, col_right = st.columns(2)
    
    with col_left:
        st.subheader("Equity Curve")
        equity_data = logger.get_equity_history()
        if equity_data:
            df = pd.DataFrame(equity_data)
            df['equity'] = pd.to_numeric(df['equity'], errors='coerce')
            df['ts'] = pd.to_datetime(df['ts'])
            st.line_chart(df.set_index('ts')['equity'])
        else:
            st.info("No equity data yet. Start the trading loop to generate data.")
    
    with col_right:
        st.subheader("Current Positions")
        try:
            if cfg.alpaca_key_id and cfg.alpaca_secret_key:
                broker = AlpacaBroker(cfg)
                positions = broker.get_positions()
                broker.close()
                
                if positions:
                    pos_df = pd.DataFrame(positions)
                    display_cols = ['symbol', 'qty', 'avg_entry_price', 'current_price', 'unrealized_pl']
                    available_cols = [c for c in display_cols if c in pos_df.columns]
                    st.dataframe(pos_df[available_cols], use_container_width=True)
                else:
                    st.info("No open positions")
            else:
                st.warning("Alpaca API keys not configured")
        except Exception as e:
            st.error(f"Failed to fetch positions: {e}")
    
    st.subheader("Recent Decisions")
    decisions = logger.get_recent_decisions(limit=10)
    if decisions:
        decisions.reverse()
        df = pd.DataFrame(decisions)
        display_cols = ['ts', 'mode', 'action', 'symbol', 'side', 'notional_usd', 'confidence', 'risk_allowed', 'reason']
        available_cols = [c for c in display_cols if c in df.columns]
        st.dataframe(df[available_cols], use_container_width=True, hide_index=True)
    else:
        st.info("No decisions yet. Start the trading loop to generate decisions.")
    
    st.subheader("Recent Trades")
    trades = logger.get_recent_trades(limit=10)
    if trades:
        trades.reverse()
        df = pd.DataFrame(trades)
        st.dataframe(df, use_container_width=True, hide_index=True)
    else:
        st.info("No trades yet.")
    
    st.caption("Auto-refreshes every loop. Click Refresh in sidebar to update manually.")


if __name__ == "__main__":
    main()
