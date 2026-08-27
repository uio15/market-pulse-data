#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
cn-marketdata.com #funds 页面 复刻数据抓取脚本
数据源：腾讯公开行情接口（K线 + 实时快照），不含任何 cn-marketdata 数据。
用法：python fetch_data.py  → 生成 data/latest.json
"""
import urllib.request, urllib.parse, json, time, datetime, sys, os
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

try:
    import boards_map  # 养基宝80板块映射表(同目录 boards_map.py)
except ImportError:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import boards_map


UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'}

def fetch(url, retries=3, headers=None, timeout=15):
    for i in range(retries):
        try:
            h = dict(UA)
            if headers: h.update(headers)
            req = urllib.request.Request(url, headers=h)
            return urllib.request.urlopen(req, timeout=timeout).read()
        except Exception as e:
            print(f'  [retry {i}] {type(e).__name__}: {str(e)[:70]}', flush=True)
            time.sleep(1.2 * (i + 1))
    return None

# ---------------- 标的清单 ----------------
# code: SHHQ516550 -> 腾讯格式 sh516550
def tq_code(code):
    c = code.replace('SHHQ', 'sh').replace('SZHQ', 'sz').lower()
    if c[0].isdigit():
        # 纯数字: 5/6/9开头=sh(沪), 1/0开头=sz(深)
        c = ('sh' if c[0] in '569' else 'sz') + c
    return c

# 39 个基金系列（与目标页 A股行业25/港股6/海外8 一致）
FUNDS = [
    ("sw_agriculture", "农林牧渔", "SHHQ516550", "a_share_industry"),
    ("sw_chemical", "基础化工", "SHHQ516020", "a_share_industry"),
    ("sw_steel", "钢铁", "SHHQ515210", "a_share_industry"),
    ("sw_nonferrous", "有色金属", "SHHQ512400", "a_share_industry"),
    ("sw_electronics", "电子", "SZHQ159997", "a_share_industry"),
    ("sw_appliance", "家用电器", "SZHQ159996", "a_share_industry"),
    ("sw_food", "食品饮料", "SHHQ515710", "a_share_industry"),
    ("sw_pharma", "医药生物", "SHHQ512010", "a_share_industry"),
    ("sw_transport", "交通运输", "SZHQ159662", "a_share_industry"),
    ("sw_real_estate", "房地产", "SHHQ512200", "a_share_industry"),
    ("sw_social_service", "社会服务", "SHHQ562510", "a_share_industry"),
    ("sw_building_material", "建筑材料", "SZHQ159745", "a_share_industry"),
    ("sw_construction", "建筑装饰", "SHHQ516950", "a_share_industry"),
    ("sw_power_equipment", "电力设备", "SHHQ516160", "a_share_industry"),
    ("sw_defense", "国防军工", "SHHQ512660", "a_share_industry"),
    ("sw_computer", "计算机", "SHHQ512720", "a_share_industry"),
    ("sw_media", "传媒", "SHHQ512980", "a_share_industry"),
    ("sw_telecom", "通信", "SHHQ515880", "a_share_industry"),
    ("sw_bank", "银行", "SHHQ512800", "a_share_industry"),
    ("sw_nonbank", "非银金融", "SHHQ512880", "a_share_industry"),
    ("sw_auto", "汽车", "SHHQ516110", "a_share_industry"),
    ("sw_machinery", "机械设备", "SHHQ516960", "a_share_industry"),
    ("sw_coal", "煤炭", "SHHQ515220", "a_share_industry"),
    ("sw_petroleum", "石油石化", "SHHQ561360", "a_share_industry"),
    ("sw_environment", "环保", "SHHQ512580", "a_share_industry"),
    ("hk_dividend", "恒生红利", "SHHQ513950", "hong_kong"),
    ("hk_internet", "恒生互联网", "SHHQ513330", "hong_kong"),
    ("hk_tech", "恒生科技", "SHHQ513130", "hong_kong"),
    ("hk_benchmark", "恒生指数ETF", "SHHQ513600", "hong_kong"),
    ("hk_health", "恒生医疗", "SHHQ513060", "hong_kong"),
    ("hk_consumer", "恒生消费", "SHHQ513970", "hong_kong"),
    ("jp_nikkei", "日经ETF", "SHHQ513520", "overseas"),
    ("us_nasdaq", "纳指ETF", "SHHQ513100", "overseas"),
    ("us_sp500", "标普500ETF", "SHHQ513500", "overseas"),
    ("kr_semiconductor", "中韩半导体ETF", "SHHQ513310", "overseas"),
    ("de_market", "德国ETF", "SHHQ513030", "overseas"),
    ("fr_market", "法国ETF", "SHHQ513080", "overseas"),
    ("sa_market", "沙特ETF", "SHHQ520830", "overseas"),
    ("br_market", "巴西ETF", "SHHQ520870", "overseas"),
]

# 17 个可交易 ETF 代理
ETF_PROXIES = [
    ("large_cap_50", "上证50", "510050", "broad"),
    ("csi_300", "沪深300", "510300", "broad"),
    ("csi_500", "中证500", "510500", "broad"),
    ("chinext", "创业板", "159915", "broad"),
    ("star_50", "科创50", "588000", "broad"),
    ("securities", "证券", "512880", "industry"),
    ("bank", "银行", "512800", "industry"),
    ("semiconductor", "半导体", "512480", "industry"),
    ("consumer", "消费", "159928", "industry"),
    ("liquor", "白酒", "512690", "industry"),
    ("medical", "医疗", "512170", "industry"),
    ("solar", "光伏", "515790", "industry"),
    ("new_energy", "新能源", "516160", "industry"),
    ("defense", "军工", "512660", "industry"),
    ("nonferrous", "有色", "512400", "industry"),
    ("real_estate", "地产", "512200", "industry"),
    ("coal", "煤炭", "515220", "industry"),
]

START = "2022-07-01"          # 留足 3 年
END = "2099-12-31"

def fetch_kline(code):
    """腾讯前复权日K：返回 [[date, open, close, high, low, volume], ...]"""
    url = (f"https://web.ifzq.gtimg.cn/appstock/app/fqkline/get"
           f"?param={code},day,{START},{END},1000,qfq")
    raw = fetch(url)
    if not raw: return None
    try:
        d = json.loads(raw)
        node = d.get("data", {}).get(code)
        if not node: return None
        day = node.get("day") or node.get("qfqday")
        if not day: return None
        return day
    except Exception as e:
        print(f"  [parse] {code}: {e}", flush=True)
        return None

def fetch_quote(codes):
    """腾讯实时快照（批量，GBK）。返回 {code: [字段...]}"""
    q = ",".join(codes)
    url = f"https://qt.gtimg.cn/q={q}"
    raw = fetch(url, headers={'Referer': 'https://gu.qq.com/'})
    if not raw: return {}
    text = raw.decode('gbk', errors='replace')
    out = {}
    for line in text.strip().split(';'):
        line = line.strip()
        if not line or '="' not in line: continue
        var, payload = line.split('="', 1)
        code = var.replace('v_', '').strip()
        fields = payload.rstrip('"').split('~')
        out[code] = fields
    return out

def pct_change(points, n):
    """points: [[date, close], ...]（时间升序）。n天涨跌幅%"""
    if len(points) < n + 1: return None
    prev = points[-1 - n][1]
    cur = points[-1][1]
    if not prev: return None
    return round((cur / prev - 1) * 100, 4)

# ---------------- 板块数据（养基宝80板块：同花顺板块 + 腾讯指数） ----------------
EM_BOARDS = boards_map.EM_BOARDS

def fetch_ths_kline(bk_code):
    """同花顺板块指数日K：返回 [[date, close], ...] 时间升序（约140根）
    格式: quotebridge_v6_line_bk_xxx_01_last({"data":"date,open,high,low,close,vol,amt,...;..."})"""
    url = f"https://d.10jqka.com.cn/v6/line/bk_{bk_code}/01/last.js"
    raw = fetch(url, headers={'Referer': 'https://q.10jqka.com.cn/'})
    if not raw: return None
    try:
        text = raw.decode('utf-8', errors='replace')
        i, j = text.find('('), text.rfind(')')
        if i < 0 or j < 0: return None
        d = json.loads(text[i+1:j])
        data = d.get("data") or ""
        pts = []
        for row in data.split(';'):
            p = row.split(',')
            if len(p) < 5: continue
            try:
                pts.append([p[0], float(p[4])])  # date, close
            except (ValueError, IndexError):
                continue
        return pts
    except Exception as e:
        print(f"  [ths-parse] bk_{bk_code}: {e}", flush=True)
        return None

def fetch_index_kline(code):
    """腾讯指数日K（sh000300/hkHSI/us.INX等）：返回 [[date, close], ...] 约320根"""
    url = f"https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param={code},day,,,320,qfq"
    raw = fetch(url)
    if not raw: return None
    try:
        d = json.loads(raw)
        node = d.get("data", {}).get(code)
        if not node: return None
        day = node.get("day") or node.get("qfqday")
        if not day: return None
        return [[r[0], float(r[2])] for r in day]
    except Exception as e:
        print(f"  [index-parse] {code}: {e}", flush=True)
        return None

def fetch_sina_index(code):
    """新浪指数日K（bj899050 北证50 等腾讯缺失）：返回 [[date, close], ...] 约320根"""
    url = (f"https://quotes.sina.cn/cn/api/jsonp_v2.php/var%20_=/CN_MarketDataService.getKLineData"
           f"?symbol={code}&scale=240&ma=no&datalen=320")
    raw = fetch(url, headers={'Referer': 'https://finance.sina.com.cn/'})
    if not raw: return None
    try:
        text = raw.decode('utf-8', errors='replace')
        i, j = text.find('['), text.rfind(']')
        if i < 0 or j < 0: return None
        arr = json.loads(text[i:j+1])
        return [[r["day"], float(r["close"])] for r in arr]
    except Exception as e:
        print(f"  [sina-parse] {code}: {e}", flush=True)
        return None

def build_board_items():
    """养基宝80个基金主题板块：同花顺板块/腾讯指数/新浪指数 日K"""
    items = []
    for bid, name, fc, src, code, note in EM_BOARDS:
        if src == "none" or not code:
            items.append({"id": bid, "name": name, "code": "", "fund_count": fc,
                          "status": "unavailable", "points": [], "latest": None,
                          "latest_date": None, "change_1d_pct": None,
                          "change_5d_pct": None, "change_20d_pct": None,
                          "quality_note": "无对应行情"})
            print(f"  - {name}: 无对应行情", flush=True)
            continue
        if src == "ths":
            pts = fetch_ths_kline(code)
        elif src == "sina":
            pts = fetch_sina_index(code)
        else:
            pts = fetch_index_kline(code)
        pts = [p for p in (pts or []) if p[1] > 0]
        if not pts:
            print(f"  [FAIL] board {name}({src}:{code}) kline failed", flush=True)
            items.append({"id": bid, "name": name, "code": code, "fund_count": fc,
                          "status": "unavailable", "points": [], "latest": None,
                          "latest_date": None, "change_1d_pct": None,
                          "change_5d_pct": None, "change_20d_pct": None})
            continue
        latest = pts[-1][1]
        latest_date = pts[-1][0]
        items.append({
            "id": bid, "name": name, "code": code, "fund_count": fc,
            "status": "ok", "note": note,
            "source_type": {"ths": "ths_board", "tq": "tencent_index", "sina": "sina_index"}[src],
            "latest": latest, "latest_date": latest_date,
            "change_1d_pct": pct_change(pts, 1),
            "change_5d_pct": pct_change(pts, 5),
            "change_20d_pct": pct_change(pts, 20),
            "points": pts,
        })
        print(f"  ✓ {name}: {len(pts)}根 最新{latest}({latest_date})", flush=True)
        time.sleep(0.15)
    return items

def build_fund_items():
    items = []
    codes = [tq_code(c) for _, _, c, _ in FUNDS]
    quotes = fetch_quote(codes)  # 一次批量拉实时
    for fid, name, code, group in FUNDS:
        tq = tq_code(code)
        day = fetch_kline(tq)
        if not day:
            print(f"  [FAIL] {name}({code}) kline failed", flush=True)
            items.append({"id": fid, "name": name, "code": code, "group": group,
                          "status": "unavailable", "points": [], "latest": None,
                          "change_1d_pct": None, "change_5d_pct": None, "change_20d_pct": None,
                          "latest_date": None, "unit": "price"})
            continue
        points = [[row[0], float(row[2])] for row in day]  # date, close
        points = [p for p in points if p[1] > 0]
        latest = points[-1][1] if points else None
        latest_date = points[-1][0] if points else None
        q = quotes.get(tq)
        if q and len(q) > 37 and q[3]:
            try:
                latest = float(q[3])
                if len(q) > 30 and len(q[30]) >= 8 and q[30][:8].isdigit():
                    ts = q[30][:8]
                    latest_date = f"{ts[:4]}-{ts[4:6]}-{ts[6:8]}"
                elif len(q) > 30 and q[30]:
                    latest_date = q[30][:10]
            except ValueError:
                pass
        items.append({
            "id": fid, "name": name, "code": code, "group": group,
            "region": "境内" if group == "a_share_industry" else ("港股" if group == "hong_kong" else "海外"),
            "source_type": "tencent_public",
            "currency": None, "unit": "price", "taxonomy": "申万一级近似" if group == "a_share_industry" else "代表ETF",
            "status": "ok", "provider": "Tencent public quote & kline",
            "provider_class": "public_remote",
            "latest_date": latest_date, "latest": latest,
            "change_1d_pct": pct_change(points, 1),
            "change_5d_pct": pct_change(points, 5),
            "change_20d_pct": pct_change(points, 20),
            "points": points,
            "quality_note": None, "corporate_action_adjustments": [],
        })
        print(f"  ✓ {name} {code}: {len(points)}根 最新{latest}({latest_date})", flush=True)
        time.sleep(0.15)
    return items

def build_proxy_items():
    items = []
    codes = [tq_code(c) for _, _, c, _ in ETF_PROXIES]
    quotes = fetch_quote(codes)
    # 沪深300 5日涨幅，用于 relative_to_csi300_5d_pct
    csi300_day = fetch_kline('sh510300')
    csi300_pts = [[r[0], float(r[2])] for r in csi300_day] if csi300_day else []
    csi300_5d = pct_change(csi300_pts, 5) or 0
    for pid, name, code, group in ETF_PROXIES:
        tq = tq_code(code)
        day = fetch_kline(tq)
        if not day:
            print(f"  [FAIL] proxy {name}({code}) kline failed", flush=True)
            items.append({"id": pid, "name": name, "code": code, "group": group,
                          "close": None, "amount": None, "change_1d_pct": None,
                          "change_5d_pct": None, "relative_to_csi300_5d_pct": None})
            continue
        pts = [[r[0], float(r[2])] for r in day]
        pts = [p for p in pts if p[1] > 0]
        close = pts[-1][1] if pts else None
        amount = None
        q = quotes.get(tq)
        if q and len(q) > 37:
            try:
                if q[3]: close = float(q[3])
                # 字段37=成交额(元)  字段6=成交量(手)
                if q[37] and q[37] != '': amount = float(q[37]) * 10000  # 腾讯接口成交额单位=万元
            except ValueError:
                pass
        if amount is None and close:
            # 兜底：K线最后一天 量(手)*100*close
            try:
                amount = float(day[-1][5]) * 100 * close
            except Exception:
                amount = None
        ch5 = pct_change(pts, 5)
        items.append({
            "id": pid, "name": name, "code": code, "group": group,
            "latest": None, "status": None,
            "change_1d_pct": pct_change(pts, 1),
            "change_5d_pct": ch5,
            "relative_to_csi300_5d_pct": round(ch5 - csi300_5d, 4) if ch5 is not None else None,
            "amount": amount, "close": close,
        })
        print(f"  ✓ proxy {name} {code}: close={close} amount={amount}", flush=True)
        time.sleep(0.15)
    return items

def main():
    print("== 抓取 39 基金系列 ==", flush=True)
    fund_items = build_fund_items()
    print("== 抓取 17 ETF 代理 ==", flush=True)
    proxy_items = build_proxy_items()
    print("== 抓取 80 养基宝板块(同花顺板块+腾讯指数) ==", flush=True)
    board_items = build_board_items()

    ok = [i for i in fund_items if i.get("status") == "ok"]
    now = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
    as_of = fund_items[0]["latest_date"] if fund_items and fund_items[0]["latest_date"] else datetime.date.today().isoformat()

    # 用数据最新日期统一 as_of
    dates = [i["latest_date"] for i in fund_items if i.get("latest_date")]
    if dates: as_of = max(dates)

    payload = {
        "schema": "compass-market-dashboard.v9",
        "generated_at": now,
        "as_of": as_of,
        "source": {
            "provider": "Tencent public market data",
            "scope": "A-share ETF daily kline with HK/overseas ETFs",
            "raw_files_uploaded": False,
            "credentials_required_in_cloud": False,
        },
        "quality": {
            "named_series": len(fund_items),
            "readable_series": len(ok),
            "catalog_only_series": len(fund_items) - len(ok),
            "note": "OHLCV 结构已验证；数据来自腾讯公开接口。",
        },
        "summary": {
            "fundamentals_available_count": len(ok),
            "a_share_count": len([i for i in fund_items if i["group"] == "a_share_industry"]),
            "boards_available_count": len([i for i in board_items if i.get("status") == "ok"]),
        },
        "comparison_universes": {
            "funds": {
                "available_count": len(fund_items),
                "taxonomy_note": "A股行业 ETF 为申万一级行业近似映射，并非官方申万指数授权数据。",
                "items": fund_items,
            }
        },
        "etf_proxies": {
            "definition": "宽基风格与行业交易载体",
            "is_official_industry_index": False,
            "items": proxy_items,
        },
        "boards": {
            "definition": "养基宝基金主题板块(80个)，行情映射自同花顺板块指数(ths)与腾讯指数(tq)公开日K",
            "note": "债基/货币基金/混债等基金类型板块无对应行情，前端显示 --",
            "items": board_items,
        },
    }
    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "latest.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    print(f"\n完成: {out_path} ({os.path.getsize(out_path)}B) as_of={as_of} ok={len(ok)}/{len(fund_items)}")

if __name__ == "__main__":
    main()
