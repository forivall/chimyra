import * as inquirer from 'inquirer'
import * as log from 'npmlog'

export async function confirm(message: string) {
  log.pause()

  const {result} = await inquirer.prompt<{
    result: boolean
  }>([
    {
      type: 'expand',
      name: 'result',
      message,
      default: 2,
      choices: [
        {key: 'y', name: 'Yes', value: true},
        {key: 'n', name: 'No', value: false},
      ],
    },
  ])

  log.resume()

  return result
}

interface PromptOptions<T = inquirer.Answers> {
  filter?: inquirer.Question<T>['filter']
  validate?: inquirer.Question<T>['validate']
}
interface SelectOptions<C extends inquirer.ChoiceType>
  extends PromptOptions<ChoiceValue<C>> {
  choices: ReadonlyArray<C>
}

interface ChoiceValue<C extends inquirer.ChoiceType> {
  prompt: C extends string ? C : C extends {value: infer T} ? T : never
}

export async function select<C extends inquirer.ChoiceType>(
  message: string,
  {choices, filter, validate}: SelectOptions<C>,
) {
  log.pause()

  const {prompt} = await inquirer.prompt<ChoiceValue<C>>([
    {
      type: 'list',
      name: 'prompt',
      message,
      choices,
      pageSize: choices.length,
      filter,
      validate,
    },
  ])

  log.resume()

  return prompt
}

export async function input(message: string, {filter, validate}: PromptOptions = {}) {
  log.pause()

  const {input} = await inquirer.prompt<{input: string}>([
    {
      type: 'input',
      name: 'input',
      message,
      filter,
      validate,
    },
  ])

  log.resume()

  return input
}
