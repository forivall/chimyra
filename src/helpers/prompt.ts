import * as inquirer from 'inquirer'
import * as log from 'npmlog'

export function confirm(message: string) {
  log.pause()

  return inquirer
    .prompt<{confirm: boolean}>([
      {
        type: 'expand',
        name: 'confirm',
        message,
        default: 2, // default to help in order to avoid clicking straight through
        choices: [
          {key: 'y', name: 'Yes', value: true},
          {key: 'n', name: 'No', value: false},
        ],
      },
    ])
    .then((answers) => {
      log.resume()

      return answers.confirm
    })
}

interface PromptOptions<T = inquirer.Answers> {
  filter?: inquirer.Question<T>['filter']
  validate?: inquirer.Question<T>['validate']
}
interface SelectOptions<C extends inquirer.ChoiceType>
  extends PromptOptions<ChoiceValue<C>> {
  choices: ReadonlyArray<C>
}

type ChoiceValue<C extends inquirer.ChoiceType> = {
  prompt: C extends string ? C : C extends {value: infer T} ? T : never
}

export function select<C extends inquirer.ChoiceType>(
  message: string,
  {choices, filter, validate}: SelectOptions<C>,
) {
  log.pause()

  return inquirer
    .prompt<ChoiceValue<C>>([
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
    .then((answers) => {
      log.resume()

      return answers.prompt
    })
}

export function input(message: string, {filter, validate}: PromptOptions = {}) {
  log.pause()

  return inquirer
    .prompt([
      {
        type: 'input',
        name: 'input',
        message,
        filter,
        validate,
      },
    ])
    .then((answers) => {
      log.resume()

      return answers.input
    })
}
