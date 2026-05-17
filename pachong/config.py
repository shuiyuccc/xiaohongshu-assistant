"""
小红书爬虫配置文件
所有参数统一在此配置，无需修改代码
"""

# ==================== 爬虫基础配置 ====================

# 目标博主主页URL
PROFILE_URL = "https://www.xiaohongshu.com/user/profile/592d9ac450c4b433caad6a47?xsec_token=YB1-rCN463o71nSBdD49nBCBtYSsLEj-7nLJ40fStpenE=&xsec_source=app_share&xhsshare=WeixinSession&appuid=5dc150c2000000000100367d&apptime=1778687019&share_id=06b0c6a087be4df48685fd4df9836016"

# 输出目录
OUTPUT_DIR = "./xiaohongshu_notes"

# 是否以无头模式运行浏览器（True=隐藏浏览器窗口，False=显示窗口）
HEADLESS = False

# 是否下载图片
DOWNLOAD_IMAGES = True

# ==================== Cookie配置 ====================

# 直接提供Cookie字符串（从浏览器开发者工具复制）
# 格式: "name1=value1; name2=value2; ..."
#
# 获取Cookie方法：
# 1. 用浏览器打开小红书并登录
# 2. 按F12打开开发者工具 -> Network(网络)标签
# 3. 刷新页面，点击任意请求，在Headers中找到Cookie
# 4. 复制Cookie字符串粘贴到下面
#
# 如果填写了MANUAL_COOKIE，将直接使用它登录，无需手动登录
MANUAL_COOKIE =""

# ==================== 性能优化配置 ====================

# 滚动加载配置
SCROLL_MAX_ATTEMPTS = 5          # 最大滚动次数
SCROLL_PAUSE_TIME = 1              # 每次滚动后暂停时间（秒），减少可提高速度
SCROLL_NO_CHANGE_THRESHOLD = 2    # 连续无新内容次数阈值，达到则认为加载完成

# 处理间隔配置
CLICK_DELAY = 1.5                 # 点击后等待时间（秒）
PAGE_TRANSITION_DELAY = 1.5          # 页面切换等待时间（秒）
DETAIL_PAGE_WAIT = 1             # 详情页加载等待时间（秒）

# 登录等待时间（秒）
LOGIN_WAIT_TIME = 15

# ==================== Excel配置 ====================

# Excel文件名
EXCEL_FILENAME = "notes_index.xlsx"

# Excel表头配置
EXCEL_HEADERS = [
    "序号",
    "标题",
    "正文",
    "点赞数",
    "收藏数",
    "评论数",
    "笔记ID",
    "链接",
    "状态"
]

# ==================== 浏览器配置 ====================

# 浏览器类型: "chrome" 或 "edge"
BROWSER_TYPE = "edge"

# Chrome浏览器路径（Windows默认路径）
CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"

# Edge浏览器路径（Windows默认路径）
EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"

# 浏览器窗口大小
VIEWPORT_WIDTH = 1920
VIEWPORT_HEIGHT = 1080

# User-Agent
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

# 浏览器启动参数
BROWSER_ARGS = [
    '--disable-blink-features=AutomationControlled',
    '--disable-web-security',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-gpu',                    # 禁用GPU加速，提高稳定性
    '--no-sandbox',                     # 禁用沙箱（某些环境需要）
    '--disable-dev-shm-usage',          # 禁用/dev/shm使用
    '--disable-extensions',             # 禁用扩展
    '--disable-plugins',                # 禁用插件
]

# ==================== 选择器配置 ====================

# 笔记卡片选择器（按优先级排序）
NOTE_SELECTORS = [
    'a.cover.mask',
    'a.cover',
    'a[href*="/explore/"]',
    'a[href*="/user/profile/"]',
    'section.note-item',
    'div.note-item',
]

# 标题选择器
TITLE_SELECTORS = [
    'title',
    'h1.title',
    'div.title',
    '.note-content h1',
    'h1',
    '.note-header h1',
    'div[class*="title"] h1',
]

# 正文内容选择器
CONTENT_SELECTORS = [
    'div.desc span',
    'div.content span',
    '.note-content .desc',
    '.note-text',
    '#detail-desc',
    '.note-body',
    '.post-content',
    'div[class*="desc"]',
    'div[class*="content"] span',
]

# 图片选择器
IMAGE_SELECTORS = [
    '.media-container .img-container img',
    '.img-container img',
    '.swiper-wrapper .swiper-slide img',
    '.swiper-slide img',
    '.note-slider-img img',
    'div[class*="swiper"] img',
    '.note-content img',
    '.image-container img',
    'img[src*="xhscdn.com"]',
]

# 关闭按钮选择器
CLOSE_SELECTORS = [
    '.close-circle',
    '.close-mask-dark',
    '.close',
    'div[class*="close"]',
    'button[class*="close"]',
    '[class*="close-circle"]',
    'svg[class*="close"]',
]

# 统计数据选择器
STATS_SELECTORS = {
    'likes': [
        '.left .like-wrapper .count',
        '[class*="like"] [class*="count"]',
        '.like-wrapper .count',
        '.like-active .count',
    ],
    'collects': [
        '.left .collect-wrapper .count',
        '[class*="collect"] [class*="count"]',
        '.collect-wrapper .count',
        '.collect-icon + span',
    ],
    'comments': [
        '.left .chat-wrapper .count',
        '[class*="chat"] [class*="count"]',
        '.chat-wrapper .count',
        '.comment-wrapper .count',
    ]
}
