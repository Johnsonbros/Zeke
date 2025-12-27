"""
Streamlit dashboard for ZEKE Trader.
Shows equity curve, decisions, trades, and positions with Plotly charts.
"""
import streamlit as st
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots
from pathlib import Path
import sys
import os
import json
from datetime import datetime, timedelta
from collections import Counter

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


def get_benchmark_data(equity_data: list, cfg) -> list | None:
    """Fetch SPY benchmark data matching the equity date range for comparison."""
    if not equity_data or len(equity_data) < 2:
        return None
    
    try:
        from zeke_trader.broker_mcp import AlpacaBroker
        
        if not cfg.alpaca_key_id or not cfg.alpaca_secret_key:
            return None
        
        start_equity = float(equity_data[0].get('equity', 100000))
        start_ts = pd.to_datetime(equity_data[0].get('ts'))
        
        broker = AlpacaBroker(cfg)
        
        try:
            from alpaca.data import StockHistoricalDataClient
            from alpaca.data.requests import StockBarsRequest
            from alpaca.data.timeframe import TimeFrame
            
            data_client = StockHistoricalDataClient(cfg.alpaca_key_id, cfg.alpaca_secret_key)
            
            request_params = StockBarsRequest(
                symbol_or_symbols=["SPY"],
                timeframe=TimeFrame.Day,
                start=start_ts - timedelta(days=7),
                end=datetime.now()
            )
            
            bars = data_client.get_stock_bars(request_params)
            spy_bars = bars["SPY"]
            
            if not spy_bars or len(spy_bars) == 0:
                broker.close()
                return None
            
            first_close = float(spy_bars[0].close)
            benchmark_data = []
            
            for bar in spy_bars:
                normalized_value = start_equity * (float(bar.close) / first_close)
                benchmark_data.append({
                    'ts': bar.timestamp.isoformat(),
                    'value': normalized_value
                })
            
            broker.close()
            return benchmark_data
            
        except Exception:
            broker.close()
            return None
            
    except Exception:
        return None


def create_equity_chart(equity_data: list, benchmark_data: list | None = None) -> go.Figure | None:
    """Create equity curve with optional benchmark overlay."""
    if not equity_data:
        return None
    
    df = pd.DataFrame(equity_data)
    df['equity'] = pd.to_numeric(df['equity'], errors='coerce')
    df['ts'] = pd.to_datetime(df['ts'])
    df = df.dropna(subset=['equity', 'ts'])
    
    if df.empty:
        return None
    
    base_equity = df['equity'].iloc[0] if not df.empty else 100000
    df['pct_return'] = (df['equity'] / base_equity - 1) * 100
    
    fig = go.Figure()
    
    fig.add_trace(go.Scatter(
        x=df['ts'],
        y=df['equity'],
        mode='lines',
        name='Portfolio',
        line=dict(color='#FF6B6B', width=2),
        fill='tozeroy',
        fillcolor='rgba(255, 107, 107, 0.1)'
    ))
    
    if benchmark_data:
        bdf = pd.DataFrame(benchmark_data)
        bdf['ts'] = pd.to_datetime(bdf['ts'])
        bdf['value'] = pd.to_numeric(bdf['value'], errors='coerce')
        fig.add_trace(go.Scatter(
            x=bdf['ts'],
            y=bdf['value'],
            mode='lines',
            name='Benchmark (SPY)',
            line=dict(color='#4ECDC4', width=1, dash='dash')
        ))
    
    fig.update_layout(
        title="Equity Curve",
        xaxis_title="",
        yaxis_title="Account Value ($)",
        template="plotly_dark",
        height=350,
        margin=dict(l=10, r=10, t=40, b=10),
        legend=dict(yanchor="top", y=0.99, xanchor="right", x=0.99),
        hovermode='x unified'
    )
    
    return fig


def create_drawdown_chart(equity_data: list) -> go.Figure | None:
    """Create drawdown chart from equity history."""
    if not equity_data:
        return None
    
    df = pd.DataFrame(equity_data)
    df['equity'] = pd.to_numeric(df['equity'], errors='coerce')
    df['ts'] = pd.to_datetime(df['ts'])
    df = df.dropna(subset=['equity', 'ts']).sort_values('ts')
    
    if df.empty:
        return None
    
    df['peak'] = df['equity'].cummax()
    df['drawdown'] = (df['peak'] - df['equity']) / df['peak'] * 100
    
    fig = go.Figure()
    
    fig.add_trace(go.Scatter(
        x=df['ts'],
        y=-df['drawdown'],
        mode='lines',
        name='Drawdown',
        line=dict(color='#E74C3C', width=2),
        fill='tozeroy',
        fillcolor='rgba(231, 76, 60, 0.2)'
    ))
    
    max_dd = df['drawdown'].max()
    max_dd_idx = df['drawdown'].idxmax()
    if pd.notna(max_dd_idx):
        max_dd_row = df.loc[max_dd_idx]
        fig.add_annotation(
            x=max_dd_row['ts'],
            y=-max_dd,
            text=f"Max DD: {max_dd:.2f}%",
            showarrow=True,
            arrowhead=2,
            arrowcolor='#E74C3C',
            font=dict(color='#E74C3C')
        )
    
    fig.update_layout(
        title="Portfolio Drawdown",
        xaxis_title="",
        yaxis_title="Drawdown (%)",
        template="plotly_dark",
        height=250,
        margin=dict(l=10, r=10, t=40, b=10),
        hovermode='x unified'
    )
    
    return fig


def create_rolling_pnl_chart(trades: list, window: int = 5) -> go.Figure | None:
    """Create rolling P&L chart from trade history."""
    if not trades:
        return None
    
    df = pd.DataFrame(trades)
    if 'pnl' not in df.columns and 'realized_pl' in df.columns:
        df['pnl'] = pd.to_numeric(df['realized_pl'], errors='coerce')
    elif 'pnl' in df.columns:
        df['pnl'] = pd.to_numeric(df['pnl'], errors='coerce')
    else:
        return None
    
    if 'timestamp' in df.columns:
        df['ts'] = pd.to_datetime(df['timestamp'])
    elif 'ts' in df.columns:
        df['ts'] = pd.to_datetime(df['ts'])
    else:
        df['ts'] = pd.to_datetime(df.index)
    
    df = df.dropna(subset=['pnl', 'ts']).sort_values('ts')
    
    if df.empty:
        return None
    
    df['cumulative_pnl'] = df['pnl'].cumsum()
    df['rolling_pnl'] = df['pnl'].rolling(window=window, min_periods=1).mean()
    
    fig = make_subplots(rows=2, cols=1, 
                        shared_xaxes=True,
                        vertical_spacing=0.1,
                        row_heights=[0.6, 0.4],
                        subplot_titles=("Cumulative P&L", f"Rolling {window}-Trade Avg"))
    
    fig.add_trace(go.Scatter(
        x=df['ts'],
        y=df['cumulative_pnl'],
        mode='lines',
        name='Cumulative',
        line=dict(color='#2ECC71', width=2),
        fill='tozeroy',
        fillcolor='rgba(46, 204, 113, 0.1)'
    ), row=1, col=1)
    
    colors = ['#2ECC71' if x >= 0 else '#E74C3C' for x in df['pnl']]
    fig.add_trace(go.Bar(
        x=df['ts'],
        y=df['pnl'],
        name='Per Trade',
        marker_color=colors,
        showlegend=True
    ), row=2, col=1)
    
    fig.add_trace(go.Scatter(
        x=df['ts'],
        y=df['rolling_pnl'],
        mode='lines',
        name=f'{window}-Trade Avg',
        line=dict(color='#F39C12', width=2, dash='dash')
    ), row=2, col=1)
    
    fig.update_layout(
        template="plotly_dark",
        height=400,
        margin=dict(l=10, r=10, t=40, b=10),
        legend=dict(yanchor="top", y=0.99, xanchor="right", x=0.99),
        hovermode='x unified'
    )
    
    return fig


def create_signal_confidence_chart(decisions: list) -> go.Figure | None:
    """Create signal confidence histogram."""
    if not decisions:
        return None
    
    confidences = [d.get('confidence', 0.5) for d in decisions if d.get('confidence')]
    if not confidences:
        return None
    
    fig = go.Figure()
    
    fig.add_trace(go.Histogram(
        x=confidences,
        nbinsx=20,
        name='Signal Confidence',
        marker_color='#9B59B6'
    ))
    
    avg_conf = sum(confidences) / len(confidences)
    fig.add_vline(x=avg_conf, line_dash="dash", line_color="#F39C12",
                  annotation_text=f"Avg: {avg_conf:.2f}")
    
    fig.update_layout(
        title="Signal Confidence Distribution",
        xaxis_title="Confidence Score",
        yaxis_title="Count",
        template="plotly_dark",
        height=250,
        margin=dict(l=10, r=10, t=40, b=10)
    )
    
    return fig


def create_win_loss_donut(trades: list) -> go.Figure | None:
    """Create win/loss ratio donut chart."""
    if not trades:
        return None
    
    wins = 0
    losses = 0
    for t in trades:
        pnl = t.get('pnl', t.get('realized_pl', 0))
        if pnl is None:
            continue
        try:
            pnl = float(pnl)
            if pnl > 0:
                wins += 1
            elif pnl < 0:
                losses += 1
        except:
            continue
    
    if wins == 0 and losses == 0:
        return None
    
    total = wins + losses
    win_rate = wins / total * 100 if total > 0 else 0
    
    fig = go.Figure()
    
    fig.add_trace(go.Pie(
        labels=['Wins', 'Losses'],
        values=[wins, losses],
        hole=0.6,
        marker_colors=['#2ECC71', '#E74C3C'],
        textinfo='label+value',
        textfont_size=12
    ))
    
    fig.add_annotation(
        text=f"{win_rate:.0f}%<br>Win Rate",
        x=0.5, y=0.5,
        font_size=16,
        showarrow=False,
        font_color='#ECF0F1'
    )
    
    fig.update_layout(
        title="Win/Loss Ratio",
        template="plotly_dark",
        height=250,
        margin=dict(l=10, r=10, t=40, b=10),
        showlegend=False
    )
    
    return fig


def create_trade_distribution_chart(trades: list) -> go.Figure | None:
    """Create trade distribution by symbol chart."""
    if not trades:
        return None
    
    symbols = [t.get('symbol', 'UNKNOWN') for t in trades if t.get('symbol')]
    if not symbols:
        return None
    
    symbol_counts = Counter(symbols)
    sorted_symbols = sorted(symbol_counts.items(), key=lambda x: x[1], reverse=True)
    
    fig = go.Figure()
    
    fig.add_trace(go.Bar(
        x=[s[0] for s in sorted_symbols],
        y=[s[1] for s in sorted_symbols],
        marker_color='#3498DB',
        text=[s[1] for s in sorted_symbols],
        textposition='auto'
    ))
    
    fig.update_layout(
        title="Trades by Symbol",
        xaxis_title="Symbol",
        yaxis_title="Trade Count",
        template="plotly_dark",
        height=250,
        margin=dict(l=10, r=10, t=40, b=10)
    )
    
    return fig


def create_risk_timeline_chart(decisions: list) -> go.Figure | None:
    """Create risk block timeline."""
    if not decisions:
        return None
    
    df = pd.DataFrame(decisions)
    if 'ts' not in df.columns:
        return None
    
    df['ts'] = pd.to_datetime(df['ts'])
    df = df.sort_values('ts')
    
    risk_blocked = df[df.get('risk_allowed', pd.Series([True]*len(df))) == False] if 'risk_allowed' in df.columns else pd.DataFrame()
    
    fig = go.Figure()
    
    fig.add_trace(go.Scatter(
        x=df['ts'],
        y=[0]*len(df),
        mode='markers',
        marker=dict(
            size=10,
            color=['#E74C3C' if not r else '#2ECC71' for r in df.get('risk_allowed', [True]*len(df))],
            symbol='circle'
        ),
        name='Decisions',
        hovertext=df.get('reason', ['No reason']*len(df))
    ))
    
    fig.update_layout(
        title="Risk Block Timeline",
        xaxis_title="Time",
        template="plotly_dark",
        height=150,
        margin=dict(l=10, r=10, t=40, b=10),
        yaxis=dict(showticklabels=False, showgrid=False),
        showlegend=False
    )
    
    return fig


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
        
        if st.button("Refresh Data", use_container_width=True):
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
    
    tab1, tab2, tab3, tab4 = st.tabs(["Performance Charts", "Positions & Orders", "Decisions", "Risk Analysis"])
    
    with tab1:
        equity_data = logger.get_equity_history()
        trades = logger.get_recent_trades(limit=100)
        decisions = logger.get_recent_decisions(limit=50)
        
        benchmark_data = get_benchmark_data(equity_data, cfg) if equity_data else None
        
        col_eq, col_dd = st.columns(2)
        
        with col_eq:
            eq_fig = create_equity_chart(equity_data, benchmark_data)
            if eq_fig:
                st.plotly_chart(eq_fig, use_container_width=True)
            else:
                st.info("No equity data yet. Start the trading loop to generate data.")
        
        with col_dd:
            dd_fig = create_drawdown_chart(equity_data)
            if dd_fig:
                st.plotly_chart(dd_fig, use_container_width=True)
            else:
                st.info("Drawdown chart will appear after trading activity.")
        
        pnl_fig = create_rolling_pnl_chart(trades)
        if pnl_fig:
            st.plotly_chart(pnl_fig, use_container_width=True)
        else:
            st.info("P&L chart will appear after trades are executed.")
        
        col_sig, col_wl, col_dist = st.columns(3)
        
        with col_sig:
            sig_fig = create_signal_confidence_chart(decisions)
            if sig_fig:
                st.plotly_chart(sig_fig, use_container_width=True)
            else:
                st.info("Confidence chart pending")
        
        with col_wl:
            wl_fig = create_win_loss_donut(trades)
            if wl_fig:
                st.plotly_chart(wl_fig, use_container_width=True)
            else:
                st.info("Win/Loss pending")
        
        with col_dist:
            dist_fig = create_trade_distribution_chart(trades)
            if dist_fig:
                st.plotly_chart(dist_fig, use_container_width=True)
            else:
                st.info("Distribution pending")
    
    with tab2:
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
        
        st.subheader("Recent Trades")
        trades = logger.get_recent_trades(limit=20)
        if trades:
            trades.reverse()
            df = pd.DataFrame(trades)
            st.dataframe(df, use_container_width=True, hide_index=True)
        else:
            st.info("No trades yet.")
    
    with tab3:
        st.subheader("Recent Decisions")
        decisions = logger.get_recent_decisions(limit=15)
        if decisions:
            decisions.reverse()
            df = pd.DataFrame(decisions)
            display_cols = ['ts', 'mode', 'action', 'symbol', 'side', 'notional_usd', 'confidence', 'risk_allowed', 'reason']
            available_cols = [c for c in display_cols if c in df.columns]
            st.dataframe(df[available_cols], use_container_width=True, hide_index=True)
            
            last_decision = decisions[-1] if decisions else None
            if last_decision and last_decision.get('thesis'):
                with st.expander("Last Decision Thesis", expanded=True):
                    thesis = last_decision['thesis']
                    col1, col2 = st.columns(2)
                    with col1:
                        st.write(f"**Summary:** {thesis.get('summary', 'N/A')}")
                        st.write(f"**System:** {thesis.get('system', 'N/A')} ({thesis.get('breakout_days', 0)}-day)")
                        st.write(f"**ATR(N):** ${thesis.get('atr_n', 0):.2f}")
                    with col2:
                        st.write(f"**Signal Score:** {thesis.get('signal_score', 0):.2f}")
                        st.write(f"**Portfolio Fit:** {thesis.get('portfolio_fit', 'N/A')}")
                        st.write(f"**Regime:** {thesis.get('regime', 'neutral')}")
        else:
            st.info("No decisions yet. Start the trading loop to generate decisions.")
    
    with tab4:
        st.subheader("Risk Analysis")
        
        decisions = logger.get_recent_decisions(limit=50)
        
        risk_fig = create_risk_timeline_chart(decisions)
        if risk_fig:
            st.plotly_chart(risk_fig, use_container_width=True)
        
        col_no_trade, col_risk = st.columns(2)
        
        with col_no_trade:
            st.subheader("NO_TRADE Reasons")
            no_trade_decisions = [d for d in decisions if d.get('action') == 'no_trade'] if decisions else []
            if no_trade_decisions:
                for d in no_trade_decisions[:5]:
                    st.text(f"{d.get('ts', '')[:19]}: {d.get('reason', 'Unknown')[:80]}")
            else:
                st.success("All recent loops resulted in trades or skips.")
        
        with col_risk:
            st.subheader("Risk Blocks")
            risk_blocked = [d for d in decisions if d.get('risk_allowed') == False] if decisions else []
            if risk_blocked:
                for d in risk_blocked[:5]:
                    st.text(f"{d.get('ts', '')[:19]}: {d.get('risk_notes', 'No details')}")
            else:
                st.success("No risk blocks in recent history.")
    
    st.caption("Dashboard refreshes with latest data. Click 'Refresh Data' in sidebar to update.")


if __name__ == "__main__":
    main()
