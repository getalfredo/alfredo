<?php

namespace App\Http\Requests\Projects;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class StoreProjectRequest extends FormRequest
{
    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'path' => [
                'required',
                'string',
                'max:1024',
                function (string $attribute, mixed $value, \Closure $fail) {
                    $realPath = realpath($value);
                    if ($realPath === false || ! is_dir($realPath)) {
                        $fail('The path must be a valid directory.');

                        return;
                    }

                    $hasComposeFile = file_exists($realPath.'/docker-compose.yml')
                        || file_exists($realPath.'/docker-compose.yaml')
                        || file_exists($realPath.'/compose.yml')
                        || file_exists($realPath.'/compose.yaml');

                    if (! $hasComposeFile) {
                        $fail('The directory must contain a docker-compose file.');
                    }
                },
            ],
            'name' => ['nullable', 'string', 'max:255'],
        ];
    }

    /**
     * Get custom messages for validation errors.
     *
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'path.required' => 'Please provide a project path.',
            'path.max' => 'The path is too long.',
        ];
    }
}
