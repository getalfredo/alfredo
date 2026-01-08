<?php

namespace App\Http\Requests\Projects;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class ExecuteCommandRequest extends FormRequest
{
    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'args' => ['nullable', 'array'],
            'args.*' => [
                'string',
                'max:255',
                function (string $attribute, mixed $value, \Closure $fail) {
                    $dangerousPatterns = [
                        '/[;&|`$]/',
                        '/\$\(/',
                    ];

                    foreach ($dangerousPatterns as $pattern) {
                        if (preg_match($pattern, $value)) {
                            $fail('The argument contains disallowed characters.');

                            return;
                        }
                    }
                },
            ],
        ];
    }

    /**
     * Prepare the data for validation.
     */
    protected function prepareForValidation(): void
    {
        if (! $this->has('args')) {
            $this->merge(['args' => []]);
        }
    }

    /**
     * Get custom messages for validation errors.
     *
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'args.*.max' => 'Each argument must be less than 255 characters.',
        ];
    }
}
