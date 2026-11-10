import registries from '../../../registries.json' with { type: 'json' }

interface RconClient {
  send(command: string): Promise<string>
}

type ToPascal<S extends string> = S extends `${infer A}_${infer B}`
  ? `${Capitalize<A>}${ToPascal<B>}`
  : Capitalize<S>

type GiveMethods = {
  [
    K in keyof (typeof registries)['minecraft:item']['entries'] as K extends `minecraft:${infer N}`
      ? `give${ToPascal<N>}`
      : never
  ]: (player: string, size: number) => Promise<string>
}

export function createItemGiver(rcon: RconClient): GiveMethods {
  const methods: Record<string, (player: string, size: number) => Promise<string>> = {}
  const entries = registries['minecraft:item'].entries

  for (const id of Object.keys(entries)) {
    const name = id
      .replace('minecraft:', '')
      .split('_')
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join('')

    methods[`give${name}`] = (player, size) => {
      if (!player.trim()) throw new Error('玩家名称不能为空')
      if (!Number.isSafeInteger(size) || size <= 0) {
        throw new Error('物品数量必须大于 0')
      }
      return rcon.send(`give ${player} ${id} ${size}`)
    }
  }

  return methods as GiveMethods
}
