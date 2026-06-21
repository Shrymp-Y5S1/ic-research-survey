import { defineConfig } from 'vitepress'
import katex from 'markdown-it-katex'

export default defineConfig({
  title: 'FPGA Bitstream 调研总览',
  description: 'Gen 4 位流几何统一编址 — 开源项目与学术论文调研',
  lang: 'zh-CN',

  srcExclude: ['**/research_report/**', '**/node_modules/**', '**/.claude/**'],

  markdown: {
    config: (md) => {
      md.use(katex)
    }
  },

  themeConfig: {
    nav: [
      { text: '总览', link: '/' },
      { text: '综述', link: '/surveys/summary' },
      { text: '调研详情', link: '/surveys/rapidwright' }
    ],

    sidebar: {
      '/surveys/': [
        {
          text: '综述',
          collapsed: false,
          items: [
            { text: '外部调研综述', link: '/surveys/summary' }
          ]
        },
        {
          text: '开源项目',
          collapsed: false,
          items: [
            { text: 'RapidWright', link: '/surveys/rapidwright' },
            { text: 'Project X-Ray', link: '/surveys/prjxray' },
            { text: 'Project U-Ray', link: '/surveys/prjuray' },
            { text: 'Bitfiltrator', link: '/surveys/bitfiltrator-oss' }
          ]
        },
        {
          text: '学术 Paper',
          collapsed: false,
          items: [
            { text: 'Bitfiltrator (FPL 2022)', link: '/surveys/bitfiltrator' },
            { text: 'ECP5 SEU 鲁棒性分析 (IOLTS 2025)', link: '/surveys/ecp5-seu-paper' }
          ]
        },
        {
          text: '综合调研',
          collapsed: false,
          items: [
            { text: '跨厂商适配可行性', link: '/surveys/multi-vendor-feasibility' }
          ]
        }
      ]
    },

    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索文档' }
        }
      }
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com' }
    ]
  }
})
