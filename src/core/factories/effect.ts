import registries from '../../../registries.json' with { type: 'json' }

interface RconClient {
  send(command: string): Promise<string>
}

type ToPascal<S extends string> = S extends `${infer A}_${infer B}`
  ? `${Capitalize<A>}${ToPascal<B>}`
  : Capitalize<S>

type EffectMethods = {
  [
    K in keyof (typeof registries)['minecraft:mob_effect']['entries'] as K extends `minecraft:${infer N}`
      ? `effect${ToPascal<N>}`
      : never
  ]: (
    player: string,
    seconds?: number,
    amplifier?: number,
    hideParticles?: boolean,
  ) => Promise<string>
} & {
  effectClear: (player: string) => Promise<string>
}

/**
 * 创建状态效果指令
 */
export function createEffectCommands(rcon: RconClient): EffectMethods {
  const methods: Record<string, Function> = {}
  const entries = registries['minecraft:mob_effect'].entries

  Object.keys(entries).forEach((id) => {
    const name = id
      .replace('minecraft:', '')
      .split('_')
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join('')

    methods[`effect${name}`] = (
      player: string,
      seconds = 30,
      amplifier = 0,
      hideParticles = false,
    ) => {
      if (!player.trim()) throw new Error('玩家名称不能为空')
      if (!Number.isSafeInteger(seconds) || seconds <= 0) {
        throw new Error('持续时间必须是大于 0 的整数')
      }
      if (!Number.isInteger(amplifier) || amplifier < 0 || amplifier > 255) {
        throw new Error('效果等级参数必须在 0 到 255 之间')
      }

      return rcon.send(`effect give ${player} ${id} ${seconds} ${amplifier} ${hideParticles}`)
    }
  })

  // 清除玩家全部状态效果
  methods.effectClear = (player: string) => {
    if (!player.trim()) throw new Error('玩家名称不能为空')
    return rcon.send(`effect clear ${player}`)
  }

  return methods as EffectMethods
}
